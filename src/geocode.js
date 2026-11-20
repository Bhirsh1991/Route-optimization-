(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./netanya-reference'));
  else root.RouteGeocode = factory(root.NetanyaReference);
}(typeof self !== 'undefined' ? self : this, function(reference) {
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
      if (streetWords(names[0]).join(' ') === streetWords(names[1]).join(' ')) return names[0];
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
    location.localityDetail = [...new Set([details.neighbourhood, details.suburb, details.quarter].filter(Boolean))].join(' · ');
    if (['amenity', 'shop', 'tourism', 'office'].includes(item.category)) location.placeName = item.name || '';
    let label = road && number ? cleanAliases(road) : '';
    if (label && !label.endsWith(' ' + number)) label += ' ' + number;
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
        const response = await fetch(url.href, {
          signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'origin'
        });
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

  function parseQuery(query, preferredCity) {
    const parts = query.trim().split(/\s*,\s*/u);
    if (parts.length === 2 && !/\d/.test(parts[0]) && /\d/.test(parts[1])) parts.reverse();
    let [first, ...rest] = parts;
    if (preferredCity && !rest.length && first.startsWith(preferredCity + ' ')) {
      first = first.slice(preferredCity.length).trim();
      rest = [preferredCity];
    }
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
    return road.split(';').some(alias => {
      const actual = streetWords(alias);
      // Hebrew names vary in full/defective spelling, e.g. איתמר / אתמר.
      return words.length && words.every(w => actual.some(a => a === w ||
        (Math.min(a.length, w.length) >= 3 && Math.abs(a.length - w.length) === 1 &&
         a.replace(/[יו]/gu, '') === w.replace(/[יו]/gu, ''))));
    });
  }

  function sameCity(actual, expected) {
    if (!actual || !expected) return true;
    const key = text => text.normalize('NFKC').split(',')[0].replace(/[-־–]+/g, ' ').trim()
      .replace(/\s+/g, ' ').toLowerCase().replace(/^תל אביב יפו$/, 'תל אביב');
    // A result can use a different language from the user's query.
    return detectLanguage(actual) !== detectLanguage(expected) || key(actual) === key(expected);
  }

  function distanceMeters(a, b) {
    const lonScale = Math.cos((a.lat + b.lat) * Math.PI / 360);
    return 111200 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * lonScale);
  }

  function resolveNumbered(rows, refs) {
    const ordered = rows.slice().sort((a, b) => Number(Boolean(a.location.placeName)) - Number(Boolean(b.location.placeName)));
    const points = [];
    const towns = new Map();
    for (const row of ordered) {
      const p = {...row.location};
      if (points.some(other => other.lat === p.lat && other.lng === p.lng)) continue;
      // A shop and an address point for the same building often have separate OSM records.
      if (p.placeName && p.mapsAddress && points.some(other =>
        other.mapsAddress === p.mapsAddress && distanceMeters(other, p) < 35)) continue;
      points.push(p);
      towns.set(p, row.city);
    }
    let choices = points;
    if (refs.length) {
      const matched = points.filter(p => refs.some(ref => distanceMeters(p, ref) <= 60));
      if (matched.length) {
        choices = matched.map(p => ({...p, referenceMatched: true}));
        // A name that geocodes to another building should travel as the selected pin.
        if (points.some(p => matched.every(m => distanceMeters(m, p) > 100))) choices.forEach(p => { p.mapsAddress = null; });
        choices.push(...refs.filter(r => matched.every(p => distanceMeters(r, p) > 60)));
      } else choices = [...refs, ...points];
    }
    return choices.map(p => {
      const conflict = choices.some(other => other !== p && distanceMeters(p, other) > 100 &&
        (refs.length || (towns.get(p) && towns.get(p) === towns.get(other)) ||
         (p.mapsAddress && p.mapsAddress === other.mapsAddress)));
      return conflict ? {...p, ambiguous: true, mapsAddress: null} : p;
    });
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
    if (query.length > 300 || hasContactDetails(query)) {
      throw new Error('לחיפוש יש להזין רק כתובת או שם מקום, ללא טלפון ופרטי מסירה.');
    }
    if (area?.city && !validSearchCity(area.city)) throw new Error('בדקו את אזור החיפוש והזינו שם עיר בלבד.');
    const parsed = parseQuery(query, area?.city?.trim());
    let street = parsed.street;
    const number = parsed.number;
    let city = parsed.city || area?.city?.trim() || '';
    const gps = !city && Number.isFinite(area?.lat) && Number.isFinite(area?.lng);
    const lat = gps ? Number(area.lat.toFixed(2)) : null;
    const lng = gps ? Number(area.lng.toFixed(2)) : null;
    const params = {format: 'jsonv2', addressdetails: '1', 'accept-language': detectLanguage(query), limit: '5'};
    if (gps) params.viewbox = viewbox(lat, lng);
    if (israelOnly) params.countrycodes = 'il';

    const lookup = async fields => (await request('search', {...params, ...fields}, isCurrent)).map(resultLocation).filter(Boolean);
    const hebrew = detectLanguage(street) === 'he';
    const plausible = row => sameCity(row.city, city) &&
      (!hebrew || matchesStreet(row.road || addressParts(row.location.fullAddress)[0] || '', streetWords(street)));
    const exact = rows => rows.filter(row => plausible(row) && row.number.toLowerCase() === number.toLowerCase());
    const refs = (town = city) => number && town ? reference.lookup(street, number, town).catch(() => []) : [];
    const numbered = async (rows, town = city) => resolveNumbered(rows, await refs(town));
    const resolveCity = async () => {
      const res = await request('reverse', {lat, lon: lng, zoom: '10', format: 'jsonv2',
        addressdetails: '1', 'accept-language': 'he'}, isCurrent);
      return res.address && (!israelOnly || res.address.country_code === 'il') ? locality(res.address) : '';
    };

    try {
      const localQuery = city && number ? [street + ' ' + number, city].join(', ')
        : city && !parsed.city && !query.includes(city) ? query + ', ' + city : query;
      let direct = await lookup({q: localQuery});
      if (!isCurrent()) return [];
      if (!city && number) {
        // Some users paste "town street number" without punctuation. Only strip a returned locality.
        const prefix = direct.map(r => r.city).find(town => town && street.startsWith(town + ' '));
        if (prefix) {
          city = prefix;
          street = street.slice(prefix.length).trim();
        }
      }
      const words = () => streetWords(street);
      if (!number) {
        const explicitlyStreet = /^(?:שדרות|רחוב|שד[׳']?|רח[׳']?|סמטת|דרך|כיכר)\s/u.test(street);
        const matches = direct.filter(row => sameCity(row.city, city) && (!explicitlyStreet || plausible(row)));
        if (matches.length) return locations(matches, false);
      }
      let found = number ? exact(direct) : [];
      let distant = [];
      if (found.length && (!gps || city || !hebrew)) return numbered(found);

      if (gps && hebrew && number) {
        const [west, north, east, south] = params.viewbox.split(',').map(Number);
        const local = found.filter(({location: p}) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east);
        if (local.length && found.length === local.length && !local.some(r => r.road.includes(';'))) {
          return numbered(local, local[0].city);
        }
        distant = found.filter(r => !local.includes(r));
        city = await resolveCity();
        if (!isCurrent()) return [];
        if (city && local.length) {
          // The regional viewbox can hide a second address in the same town.
          const municipal = await lookup({street: number + ' ' + street, city, limit: '15'});
          found = exact([...municipal, ...local]);
          if (found.length) return numbered(found);
        }
      } else if (gps && hebrew && !city) city = await resolveCity();

      if (!city && number && hebrew && !gps && street.includes(' ') && !direct.some(plausible)) {
        // Try a city-first phrase only when the returned city, street and house confirm that split.
        const [first, ...tail] = street.split(/\s+/u);
        const rest = tail.join(' ');
        const possible = await lookup({street: number + ' ' + rest, city: first});
        const matches = possible.filter(row => row.city && sameCity(row.city, first) &&
          matchesStreet(row.road, streetWords(rest)) && row.number.toLowerCase() === number.toLowerCase());
        if (matches.length) {
          street = rest;
          return numbered(matches, first);
        }
      }

      let nearby = direct.filter(row => plausible(row) && !row.number);
      if (hebrew && city && words().length) {
        if (number && words().length === 1) {
          const houses = await lookup({street: number + ' ' + street, city});
          const confirmed = exact(houses);
          if (confirmed.length) return numbered(confirmed);
          nearby = [...nearby, ...houses.filter(row => plausible(row) && !row.number)];
        }
        const anchor = words().find(w => w === 'בן' || w === 'בר') || words()[0];
        const candidates = await lookup({street: anchor, city, layer: 'address', limit: '20'});
        const roads = candidates.filter(r => r.road && !r.number && plausible(r));
        if (roads.length) {
          const alias = roads[0].road.split(';').find(name => matchesStreet(name, words())).trim();
          if (number && (words().length > 1 || alias !== street)) {
            const houses = await lookup({street: number + ' ' + alias, city});
            const confirmed = exact(houses);
            if (confirmed.length) return numbered(confirmed);
          }
          const seen = new Set();
          nearby = roads.filter(row => {
            const key = cleanAliases(row.road) + '/' + row.city;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      }
      if (!isCurrent()) return [];
      const localReference = await refs();
      if (localReference.length) return localReference;
      if (!nearby.length && number) {
        const fallback = await lookup({q: [street, city].filter(Boolean).join(', ')});
        nearby = fallback.filter(row => plausible(row) && !row.number);
      }
      return locations(nearby, Boolean(number)).concat(locations(distant, false));
    } catch (error) {
      if (!isCurrent()) return [];
      const localReference = await refs();
      if (localReference.length) return localReference;
      throw error;
    }
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
  const contactLabel = /(?:^|[\s,;|])(?:שם(?:\s+(?:הלקוח|לקוח|הנמען))?|לקוח[ה]?|נמען|מקבל|טלפון|טל[׳']?|נייד|אימייל|דוא["״]ל|הערות?|שפה|דובר(?:ת|ים)?|קוד(?:ן|\s+כניסה)?|נפשות|גיל|עבור|name|recipient|phone|tel|mobile|e-?mail|contact|notes?|age|access\s+code)(?:\s*[:=]|\s+[–-]|\s*[–-](?=\s|\d))/iu;
  const personalNumber = /(?:^|[\s,;|])(?:מספר נפשות|נפשות|גיל|age|קודן|קוד כניסה|טלפון|נייד|mobile|phone)\s+\d|^(?:בן|בת)\s+\d/iu;
  const deliveryNote = /(?:^|[\s,;|])(?:הערות?(?:\s+למסירה)?|איש קשר|מספר נפשות|דובר(?:ת|ים)?|פרטי מסירה|delivery notes?|contact person|access code)\s+\S/iu;
  const recipientAfterAddress = /\p{L}[^\d\r\n]*\d+[\p{L}-]*[\s,;|]+(?:שם(?:\s+הנמען)?|נמען|לקוח[ה]?|מקבל|שפה|recipient|contact name|phone|mobile|email)\s+\S/iu;

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
      /[\r\n\u2028\u2029]|https?:\/\//iu.test(text) || chatHeader.test(text) ||
      contactLabel.test(text) || personalNumber.test(text) || text.replace(deliveryDetail, '') !== text ||
      deliveryNote.test(text) || recipientAfterAddress.test(text);
  }

  function validSearchCity(value) {
    return typeof value === 'string' && value.length <= 160 && /\p{L}/u.test(value) && !hasContactDetails(value);
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
    const tooLong = 'הרשימה ארוכה מדי. אפשר לפצל אותה לחלקים של עד 32,000 תווים, 400 שורות ועד 1,500 תווים בשורה.';
    if (message.length > 32000) throw new Error(tooLong);
    const inputLines = message.split(/\r?\n/);
    if (inputLines.length > 400 || inputLines.some(line => line.length > 1500)) throw new Error(tooLong);
    const sections = [];
    let section = [];
    for (const raw of inputLines) {
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

  return { detectLanguage, shortenAddress, displayFullAddress, stripHouseNumber, hasContactDetails, validSearchCity, extractAddresses, extractDeliveryRows, findAddresses };
}));
