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
    if (!item || typeof item.display_name !== 'string' || !item.display_name.trim() ||
        item.lat == null || item.lon == null || !String(item.lat).trim() || !String(item.lon).trim()) return null;
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;
    const details = item.address || {};
    const city = locality(details);
    const road = details.road || details.pedestrian || details.footway || '';
    const number = (details.house_number || '').toString();
    const location = { address: shortenAddress(item.display_name), fullAddress: item.display_name, lat, lng, mapsAddress: null };
    let label = road && number ? cleanAliases(road) + ' ' + number : '';
    if (!label && ['amenity', 'tourism', 'shop', 'leisure'].includes(item.category)) label = item.name;
    if (label && city) location.mapsAddress = [label, city, details.country].filter(Boolean).join(', ');
    return { location, road, number, city, category: item.category };
  }

  function locality(address) {
    return address.city || address.town || address.village || address.municipality || '';
  }

  function rateLimitMessage() {
    return 'שירות הכתובות קיבל יותר מדי בקשות. יש להמתין לפני חיפוש נוסף.';
  }

  function request(path, params, isCurrent) {
    const url = new URL('https://nominatim.openstreetmap.org/' + path);
    url.search = new URLSearchParams(params);
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
        if (path === 'reverse' && response.status === 404) return {};
        if (!response.ok) throw new Error('שירות חיפוש הכתובות החזיר שגיאה (' + response.status + ').');
        const data = await response.json();
        if (!data || (path === 'search' && !Array.isArray(data))) throw new Error('התקבלה תשובה לא תקינה משירות הכתובות.');
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, data);
        return data;
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

  function parseQuery(query) {
    const [first, ...rest] = query.trim().split(/\s*,\s*/u);
    const numberPattern = '(\\d+(?:[-/]\\d+)?[a-zA-Zא-ת]?)';
    const leading = first.match(new RegExp('^' + numberPattern + '\\s+(.+)$', 'u'));
    if (leading) return { street: leading[2], number: leading[1], city: rest.join(', ') };
    const trailing = first.match(new RegExp('^(.+?)\\s+' + numberPattern + '(?:\\s+(.+))?$', 'u'));
    if (trailing) return { street: trailing[1], number: trailing[2], city: [trailing[3], ...rest].filter(Boolean).join(', ') };
    return { street: first, number: '', city: rest.join(', ') };
  }

  function streetWords(name) {
    return name.normalize('NFKC').replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2'"׳״’“”]/gu, '')
      .replace(/[־\-–—]/gu, ' ').replace(/^(?:רחוב|רח|שדרות|שד|שדרת|סמטת|דרך|כיכר)\s+/u, '')
      .trim().toLowerCase().split(/\s+/u).filter(Boolean);
  }

  function matchesStreet(road, words) {
    const actual = streetWords(road);
    // Hebrew names vary in full/defective spelling, e.g. איתמר / אתמר.
    return words.every(w => actual.some(a => a === w ||
      (Math.min(a.length, w.length) >= 3 && Math.abs(a.length - w.length) === 1 &&
       a.replace(/[יו]/gu, '') === w.replace(/[יו]/gu, ''))));
  }

  function locations(rows, approximate) {
    const distinct = [];
    for (const {location} of rows) {
      if (distinct.some(p => p.lat === location.lat && p.lng === location.lng)) continue;
      const p = {...location};
      if (approximate) {
        p.approximate = true;
        p.address += ' (ללא מספר בית מאומת)';
      }
      // Equal text pointing at different coordinates cannot identify the selected point in Maps.
      if (!p.mapsAddress || approximate || rows.some(r => r.location.mapsAddress === p.mapsAddress &&
        (r.location.lat !== p.lat || r.location.lng !== p.lng))) p.mapsAddress = null;
      distinct.push(p);
    }
    return distinct;
  }

  function viewbox(lat, lng) {
    const dx = Math.min(180, 0.12 / Math.max(0.1, Math.cos(lat * Math.PI / 180)));
    return [Math.max(-180, lng - dx), Math.min(90, lat + 0.12),
      Math.min(180, lng + dx), Math.max(-90, lat - 0.12)].map(v => v.toFixed(2)).join(',');
  }

  async function findAddresses(query, israelOnly = false, isCurrent = () => true, area = {}) {
    query = query.trim();
    if (!query || !isCurrent()) return [];
    const { street, number, city: explicitCity } = parseQuery(query);
    let city = explicitCity || area?.city?.trim() || '';
    const gps = !city && Number.isFinite(area?.lat) && Number.isFinite(area?.lng);
    const lat = gps ? Number(area.lat.toFixed(2)) : null;
    const lng = gps ? Number(area.lng.toFixed(2)) : null;
    const params = { format: 'jsonv2', addressdetails: '1', 'accept-language': detectLanguage(query), limit: '5' };
    if (gps) params.viewbox = viewbox(lat, lng);
    if (israelOnly) params.countrycodes = 'il';
    const lookup = async fields => (await request('search', {...params, ...fields}, isCurrent)).map(resultLocation).filter(Boolean);
    const localQuery = !explicitCity && city && !query.includes(city) ? query + ', ' + city : query;
    const direct = await lookup({q: localQuery});
    const words = streetWords(street);
    const hebrew = detectLanguage(street) === 'he';
    const plausible = r => !hebrew || matchesStreet(r.road || addressParts(r.location.fullAddress)[0] || '', words);
    const correctNumber = r => r.number.toLowerCase() === number.toLowerCase();
    const explicitlyStreet = /^(?:שדרות|רחוב|שד[׳']?|רח[׳']?|סמטת|דרך|כיכר)\s/u.test(street);
    if (!number) {
      const matches = explicitlyStreet ? direct.filter(plausible) : direct;
      if (matches.length) return locations(matches, false);
    }
    const exact = direct.filter(r => plausible(r) && correctNumber(r));
    let distant = [];
    if (number && exact.length) {
      if (!gps || !hebrew) return locations(exact, false);
      const [west, north, east, south] = params.viewbox.split(',').map(Number);
      const local = exact.filter(({location: p}) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east);
      if (local.length) return locations(local, false);
      distant = locations(exact, false);
    }
    if (!isCurrent()) return [];

    let nearby = direct.filter(r => plausible(r) && !r.number);
    // A shortened Hebrew street can be absent from free-form search even when the road is mapped.
    // Discover roads in the selected city using a surviving token, then verify all tokens locally.
    if (hebrew && words.length && (city || gps) && (words.length > 1 || !number || distant.length)) {
      if (!city) {
        const result = await request('reverse', { lat, lon: lng, zoom: '10', format: 'jsonv2',
          addressdetails: '1', 'accept-language': 'he' }, isCurrent);
        if (result.address && (!israelOnly || result.address.country_code === 'il')) city = locality(result.address);
      }
      if (city) {
        const anchor = words.find(w => w === 'בן' || w === 'בר') || words[0];
        const found = await lookup({street: anchor, city, layer: 'address', limit: '20'});
        const roads = found.filter(r => r.road && !r.number && matchesStreet(r.road, words));
        if (roads.length) {
          nearby = roads;
          const canonical = roads[0];
          let buildings = [];
          if (number) {
            const houses = await lookup({street: number + ' ' + canonical.road, city: canonical.city || city});
            const confirmed = houses.filter(r => streetWords(r.road).join(' ') === streetWords(canonical.road).join(' ') && correctNumber(r));
            buildings = locations(confirmed, false);
          }
          // A street is often split into many geometries. Offer one representative per road and town.
          const seen = new Set();
          if (buildings.length) seen.add(streetWords(canonical.road).join(' ') + '/' + canonical.city);
          const others = locations(roads.filter(r => {
            const key = streetWords(r.road).join(' ') + '/' + r.city;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }), Boolean(number));
          return buildings.length ? buildings.concat(others) : others.concat(distant);
        }
      }
    }
    if (nearby.length) return locations(nearby, Boolean(number)).concat(distant);
    if (!number) return [];
    const streetRows = await lookup({q: [street, city].filter(Boolean).join(', ')});
    return locations(streetRows.filter(r => plausible(r) && !r.number), true).concat(distant);
  }

  // Only labeled addresses or recognizable street lines become suggestions.
  // Free-form personal messages remain local for manual review.
  const phonePattern = /(?:\+[\d][\d ().-]{6,}\d|(?:\b0|\b\d{3}[ -])(?:[ ().-]*\d){7,10}\b|\b\d{8,}\b)/g;
  const emailPattern = /[\w.+-]+@[\w.-]+\.\w+/g;
  const chatHeader = /^(?:\[[^\]]{2,40}\]|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}\s*[-–])\s*[^:]{1,60}:\s*/u;
  const nameLabel = /^(?:שם(?:\s+(?:הלקוח|לקוח|הנמען))?|לקוח|לקוחה|נמען|מקבל|name|recipient)\s*[:=–-]/iu;
  const nonAddressLine = /^(?:(?:שם|לקוח|לקוחה|נמען|מקבל|טלפון|טל׳?|נייד|אימייל|דוא"ל|הערות?|גיל|שפה|דובר(?:ת|ים)?|קומה|דירה|כניסה|קוד|מספר נפשות|נפשות|מצב משפחתי|עבור|name|contact|email|phone|tel|mobile|age|language|notes?|floor|apt)(?=$|[\s:=–-])|(?:בן|בת)\s+[\d])/iu;
  const deliveryDetail = /(?:^|[\s,;(])((?:דירה|קומה|כניסה|apartment|apt\.?|floor|entrance)\s*[:=#–-]?\s*(?:קרקע|מרתף|-?\d+(?:[/-]\d+)?[\p{L}]?|[א-תa-z])['׳]?)(?![\p{L}\d])/giu;
  const trailingMeta = /[\s,;|]+(?:שם(?:\s+(?:הלקוח|לקוח|הנמען))?|לקוח|לקוחה|נמען|טלפון|טל׳?|נייד|איש קשר|הערות?|קוד|דירה|קומה|כניסה|שפה|דובר(?:ת|ים)?|גיל|מספר נפשות|name|phone|tel|mobile|contact|age|notes?|floor|apt\.?)(?=$|[\s:=–-])/giu;

  function withoutMetadata(text) {
    for (const match of text.matchAll(trailingMeta)) {
      const prefix = text.slice(0, match.index);
      const afterLabel = text.slice(match.index + match[0].length);
      // A street itself can contain a word such as "שם" before its house number.
      if (/\d/.test(prefix) || /^\s*[:=–-]/u.test(afterLabel)) return prefix;
    }
    return text;
  }

  function cleanImportLine(line) {
    return line.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\\+\s*$/, '').replace(/\\([*_~])/g, '$1')
      .replace(/([*_~])([^*_~\n]+)\1/g, '$2').trim();
  }

  function hasContactDetails(text) {
    return text.replace(phonePattern, '').replace(emailPattern, '') !== text ||
      nonAddressLine.test(text.trim()) || withoutMetadata(text) !== text;
  }

  function extractAddresses(message) {
    const lines = message.split(/\r?\n/);
    const addresses = [];
    for (let raw of lines) {
      raw = cleanImportLine(raw).replace(chatHeader, '');
      const label = raw.match(/(?:^|[\s,;|–—-])(?:כתובת(?:\s+(?:למשלוח|המשלוח))?|address)\s*[:=–-]\s*(.+)/iu);
      let value;
      if (label) {
        value = label[1].split(/\s*[|;]\s*|\s+[-–—]\s+/u)[0];
      } else {
        if (nonAddressLine.test(raw) && !raw.includes('|')) continue;
        const chunks = raw.split(/\s*[|;]\s*|\s+[-–—]\s+/u);
        for (const chunk of chunks) {
          const prefixed = chunk.match(/(?:^|[\s,:])((?:רחוב|רח׳|רח'|שדרות|שד׳|שד'|סמטת|דרך|כיכר)\s+.+)/u);
          const candidate = withoutMetadata((prefixed ? prefixed[1] : chunk)
            .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(deliveryDetail, '')).trim();
          if (nonAddressLine.test(candidate)) continue;
          if (prefixed || /^(?:\p{L}[\p{L}"׳״'. -]+)\s+\d{1,5}(?:[/-]\d{1,5})?[\p{L}]?(?:\s*,|$)/u.test(candidate) ||
              /^\d+\s+(?:[\p{L}.'-]+\s+){0,4}[\p{L}.'-]+\s+(?:road|street|avenue|lane|drive|rd|st)\b/iu.test(candidate)) {
            value = candidate;
            break;
          }
        }
      }
      if (!value) continue;
      value = withoutMetadata(value.replace(deliveryDetail, '')).replace(phonePattern, '').replace(emailPattern, '')
        .replace(/\s*,(?:\s*,)+/g, ',').replace(/^[\s,:–-]+|[\s,:–-]+$/g, '').trim();
      if (value && !addresses.includes(value)) addresses.push(value);
    }
    return addresses;
  }

  function localContact(lines) {
    const names = new Set();
    const phones = new Set();
    for (const line of lines) {
      const labeled = line.match(/(?:^|[\s,;|–—-])(?:שם(?:\s+(?:הלקוח|לקוח|הנמען))?|לקוח|לקוחה|נמען|מקבל|name|recipient)\s*[:=–-]\s*([^,;|:\n]+)/iu);
      if (labeled) {
        const name = labeled[1].split(/\s+[-–—]\s+|\s+(?:טלפון|טל׳?|נייד|כתובת|phone|address)(?=\s|$)|\s+\d/iu)[0].trim();
        if (name) names.add(name);
      } else {
        // A leading name separated from a street and phone on the same delivery line.
        const parts = line.split(/\s*[|;]\s*|\s+[-–—]\s+/u);
        if (parts.length > 1 && !/^(?:כתובת|address)$/iu.test(parts[0]) && extractAddresses(parts[1]).length &&
            /^[\p{L}][\p{L}'׳״"-]*(?:\s+[\p{L}][\p{L}'׳״"-]*){0,2}$/u.test(parts[0])) {
          names.add(parts[0]);
        }
      }
      for (const number of line.match(phonePattern) || []) phones.add(number.trim());
    }
    // Typical WhatsApp delivery cards start with an unlabelled recipient on their own line.
    if (!names.size && lines.length > 1 && !nonAddressLine.test(lines[0]) &&
        !extractAddresses(lines[0]).length && /^[\p{L}][\p{L}'׳״"-]*(?:\s+[\p{L}][\p{L}'׳״"-]*){1,3}$/u.test(lines[0])) {
      names.add(lines[0]);
    }
    return { name: names.size === 1 ? [...names][0] : '', phone: phones.size === 1 ? [...phones][0] : '' };
  }

  function extractDeliveryRows(message) {
    const sections = [];
    let section = [];
    for (const raw of message.split(/\r?\n/)) {
      let line = cleanImportLine(raw);
      if (!line || chatHeader.test(line) || (section.some(item => nameLabel.test(item)) && nameLabel.test(line))) {
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
        const record = found.length === 1 ? lines : [line];
        const { name, phone } = localContact(record);
        const details = record.flatMap(item => Array.from(item.matchAll(deliveryDetail), match => match[1])).join(' · ');
        if (!rows.some(row => row.address === address && row.name === name && row.phone === phone && row.details === (details || undefined))) {
          rows.push(details ? { address, name, phone, details } : { address, name, phone });
        }
      }
    }
    return rows;
  }

  return { detectLanguage, shortenAddress, displayFullAddress, stripHouseNumber, hasContactDetails, extractAddresses, extractDeliveryRows, findAddresses };
}));
