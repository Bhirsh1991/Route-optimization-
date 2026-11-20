(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RouteGeocode = factory();
}(typeof self !== 'undefined' ? self : this, function() {
  const cache = new Map();
  let pending = Promise.resolve();
  let nextRequest = 0;
  let retryAfter = 0;

  function detectLanguage(text) {
    return /[\u0590-\u05ff]/.test(text) ? 'he' : 'en';
  }

  function cleanAliases(part) {
    const names = [...new Set(part.split(';').map(name => name.trim()).filter(Boolean))];
    if (names.length === 2) {
      // OSM can supply both a full street name and its alias with the house number.
      const numbered = names[1].match(/^(.+?)\s+(\d+[\p{L}-]*)$/u);
      if (numbered && (names[0] === numbered[1] || names[0].endsWith(' ' + numbered[1]))) {
        return names[0] + ' ' + numbered[2];
      }
    }
    return names.join(' / ');
  }

  function addressParts(displayName) {
    const parts = displayName.split(',').map(cleanAliases).filter(Boolean);
    if (parts.length > 1 && /^\d+[\p{L}-]*$/u.test(parts[0])) {
      const number = parts.shift();
      if (!parts[0].endsWith(' ' + number)) parts[0] += ' ' + number;
    }
    return parts;
  }

  function shortenAddress(displayName) {
    return addressParts(displayName).slice(0, 3).join(', ');
  }

  function displayFullAddress(displayName) {
    return addressParts(displayName).join(', ');
  }

  function stripHouseNumber(address) {
    const [street, ...rest] = address.split(',').map(part => part.trim());
    const stripped = street.replace(/^\d+[\p{L}-]*\s+|\s+\d+[\p{L}-]*$/gu, '').trim();
    return stripped && stripped !== street ? [stripped, ...rest].filter(Boolean).join(', ') : '';
  }

  function resultLocation(item) {
    if (typeof item.display_name !== 'string' || !item.display_name.trim() ||
        item.lat == null || item.lon == null || !String(item.lat).trim() || !String(item.lon).trim()) return null;
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;
    return { address: shortenAddress(item.display_name), fullAddress: item.display_name, lat, lng,
      streetOnly: item.address != null && !item.address.house_number };
  }

  function rateLimitMessage() {
    return 'שירות הכתובות קיבל יותר מדי בקשות. יש להמתין לפני חיפוש נוסף.';
  }

  function search(query, israelOnly, isCurrent = () => true) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: query.trim(), format: 'jsonv2', addressdetails: '1',
      limit: '5', 'accept-language': detectLanguage(query) });
    if (israelOnly) url.searchParams.set('countrycodes', 'il');
    const key = url.href;
    const run = async () => {
      if (!isCurrent()) return [];
      if (cache.has(key)) return cache.get(key);
      if (Date.now() < retryAfter) throw new Error(rateLimitMessage());
      const delay = nextRequest - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      if (!isCurrent()) return [];
      nextRequest = Date.now() + 1100;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url.href, { signal: controller.signal });
        if (response.status === 429) {
          const header = response.headers.get('Retry-After');
          const until = header && !/^\d+$/.test(header) ? Date.parse(header) : Date.now() + Number(header) * 1000;
          retryAfter = Math.max(Date.now() + 60000, Number.isFinite(until) ? until : 0);
          throw new Error(rateLimitMessage());
        }
        if (response.status === 403) throw new Error('שירות חיפוש הכתובות חסם את הבקשה.');
        if (!response.ok) throw new Error('שירות חיפוש הכתובות החזיר שגיאה (' + response.status + ').');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('התקבלה תשובה לא תקינה משירות הכתובות.');
        const results = data.map(resultLocation).filter(Boolean);
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, results);
        return results;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('החיפוש ארך זמן רב. אפשר לנסות שוב.');
        if (error instanceof TypeError) throw new Error('לא ניתן להגיע לשירות חיפוש הכתובות. יש לבדוק את החיבור.');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    };
    const request = pending.then(run);
    pending = request.catch(() => {});
    return request;
  }

  async function findAddresses(query, israelOnly = false, isCurrent = () => true) {
    const candidates = await search(query, israelOnly, isCurrent);
    const street = stripHouseNumber(query);
    const fallback = !candidates.length && street && isCurrent();
    const choices = fallback ? await search(street, israelOnly, isCurrent) : candidates;
    return choices.map(({ streetOnly, ...location }) =>
      fallback || (street && streetOnly)
        ? { ...location, address: location.address + ' (ללא מספר בית מאומת)', approximate: true }
        : location
    );
  }

  // Only labeled addresses or recognizable street lines become suggestions.
  // Free-form personal messages remain local for manual review.
  const phonePattern = /(?:\+[\d][\d ().-]{6,}\d|(?:\b0|\b\d{3}[ -])(?:[ ().-]*\d){7,10}\b|\b\d{8,}\b)/g;
  const emailPattern = /[\w.+-]+@[\w.-]+\.\w+/g;
  const chatHeader = /^(?:\[[^\]]{2,40}\]|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}\s*[-–])\s*[^:]{1,60}:\s*/u;

  function hasContactDetails(text) {
    return text.replace(phonePattern, '').replace(emailPattern, '') !== text ||
      /(?:^|\s)(?:שם|לקוח|נמען|טלפון|נייד|name|phone|contact)\s*[:=]/iu.test(text);
  }

  function extractAddresses(message) {
    const lines = message.replace(/[\u200e\u200f\u202a-\u202e]/g, '').split(/\r?\n/);
    const addresses = [];
    const meta = /(?:^|[\s,;|–—-]+)(?:שם(?:\s+(?:הלקוח|לקוח|הנמען))?|לקוח|לקוחה|נמען|מקבל|טלפון|טל׳?|נייד|איש קשר|הערות|קומה|דירה|כניסה|קוד|name|phone|tel|mobile|apt|floor|contact)\s*[:=\-].*$/iu;
    for (let raw of lines) {
      raw = raw.trim().replace(chatHeader, '');
      const label = raw.match(/(?:^|[\s,;|–—-])(?:כתובת(?:\s+(?:למשלוח|המשלוח))?|address)\s*[:=–-]\s*(.+)/iu);
      let value;
      if (label) {
        value = label[1].split(/\s*[|;]\s*|\s+[-–—]\s+/u)[0];
      } else {
        const chunks = raw.split(/\s*[|;]\s*|\s+[-–—]\s+/u);
        for (const chunk of chunks) {
          const prefixed = chunk.match(/(?:^|[\s,:])((?:רחוב|רח׳|רח'|שדרות|שד׳|שד'|סמטת|דרך|כיכר)\s+.+)/u);
          const candidate = (prefixed ? prefixed[1] : chunk).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
          if (/^(?:שם|לקוח|נמען|טלפון|נייד|name|phone)\s*:/iu.test(candidate)) continue;
          if (prefixed || /^(?:\p{L}[\p{L}"׳״'. -]+)\s+\d+[\p{L}]?(?:\s*,|$)/u.test(candidate) ||
              /^\d+\s+(?:[\p{L}.'-]+\s+){0,4}[\p{L}.'-]+\s+(?:road|street|avenue|lane|drive|rd|st)\b/iu.test(candidate)) {
            value = candidate;
            break;
          }
        }
      }
      if (!value) continue;
      value = value.replace(meta, '').replace(phonePattern, '').replace(emailPattern, '').replace(/^[\s,:–-]+|[\s,:–-]+$/g, '').trim();
      if (value && !addresses.includes(value)) addresses.push(value);
    }
    return addresses;
  }

  function localContact(lines) {
    const names = new Set();
    const phones = new Set();
    for (const line of lines) {
      const labeled = line.match(/(?:^|[\s,;|–—-])(?:שם(?:\s+(?:הלקוח|לקוח|הנמען))?|לקוח|לקוחה|נמען|מקבל|name|recipient)\s*[:=]\s*([^,;|:\n]+)/iu);
      if (labeled) {
        const name = labeled[1].split(/\s+[-–—]\s+|\s+(?:טלפון|טל׳?|נייד|כתובת|phone|address)(?=\s|$)|\s+\d/iu)[0].trim();
        if (name) names.add(name);
      } else {
        // A leading name separated from a street and phone on the same delivery line.
        const parts = line.split(/\s*[|;]\s*|\s+[-–—]\s+/u);
        if (parts.length > 1 && extractAddresses(parts[1]).length && /^[\p{L}][\p{L}'׳״"-]*(?:\s+[\p{L}][\p{L}'׳״"-]*){0,2}$/u.test(parts[0])) {
          names.add(parts[0]);
        }
      }
      for (const number of line.match(phonePattern) || []) phones.add(number.trim());
    }
    return { name: names.size === 1 ? [...names][0] : '', phone: phones.size === 1 ? [...phones][0] : '' };
  }

  function extractDeliveryRows(message) {
    const sections = [];
    let section = [];
    const nameFirst = /^(?:שם(?:\s+(?:הלקוח|לקוח|הנמען))?|לקוח|לקוחה|נמען|name|recipient)\s*[:=]/iu;
    for (let line of message.replace(/[\u200e\u200f\u202a-\u202e]/g, '').split(/\r?\n/)) {
      line = line.trim();
      if (!line || chatHeader.test(line) || (section.length && nameFirst.test(section[0]) && nameFirst.test(line))) {
        if (section.length) sections.push(section);
        section = [];
      }
      line = line.replace(chatHeader, '');
      if (line) section.push(line);
    }
    if (section.length) sections.push(section);

    const rows = [];
    for (const lines of sections) {
      const found = lines.flatMap(line => extractAddresses(line).map(address => ({ address, line })));
      for (const { address, line } of found) {
        // Multiple addresses without a clear record boundary only use same-line contacts.
        const { name, phone } = localContact(found.length === 1 ? lines : [line]);
        if (!rows.some(row => row.address === address && row.name === name && row.phone === phone)) {
          rows.push({ address, name, phone });
        }
      }
    }
    return rows;
  }

  return { detectLanguage, shortenAddress, displayFullAddress, stripHouseNumber, hasContactDetails, extractAddresses, extractDeliveryRows, findAddresses };
}));
