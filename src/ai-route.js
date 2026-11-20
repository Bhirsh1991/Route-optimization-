(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./optimizer'), require('./address-reference'), require('./road-table'));
  } else root.AIRoute = factory(root, root.AddressReference, root.RoadTable, root.NetanyaReference);
}(typeof self !== 'undefined' ? self : this, function(optimizer, reference, road, localReference) {
  const site = 'https://bhirsh1991.github.io/Route-optimization-/';
  const linkLimit = 16384;
  const invalid = 'הקישור למסלול אינו תקין.';
  const addressOnly = 'יש להעביר רק כתובת או שם מקום, ללא פרטי קשר או פרטי מסירה.';
  const labels = /(?:^|[\s,;])(?:דירה|קומה|כניסה|טלפון|נייד|קודן|הערות|מספר נפשות|דובר(?:ת)?|למסירה|עבור|apartment|apt\.?|floor|entrance|phone|mobile|e-?mail|recipient|notes?)(?=$|[\s.:=#–-])|(?:^|[\s,;])(?:שם|name|לקוח|קוד|שער|contact)\s*[:=–-]/iu;
  const phone = /(?:^|[^\d])(?:\+?\d[\s().-]*){8,15}(?!\d)/u;
  const urlOrMail = /[@<>\\]|[a-z][a-z0-9+.-]*:\/\/|(?:^|\s)(?:www\.|(?:tel|sms|mailto|data|javascript):)|[\w-]+\.(?:com|net|org|co\.il|io|me|dev|app)(?=[/\s]|$)/iu;

  function text(value) {
    if (typeof value !== 'string' || value.length > 160 || /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(value) ||
        !/\p{L}/u.test(value) || phone.test(value) || labels.test(value) || urlOrMail.test(value)) {
      throw new Error(addressOnly);
    }
    return value.trim();
  }

  function fields(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.stops) ||
        Object.keys(input).some(k => !['city', 'start', 'stops', 'end'].includes(k))) throw new Error(invalid);
    const result = {stops: []};
    for (const key of ['city', 'start', 'end']) {
      if (input[key] !== undefined && input[key] !== '') result[key] = text(input[key]);
    }
    const n = input.stops.length + Number(Boolean(result.start)) + Number(Boolean(result.end));
    if (n < 2 || n > 25) throw new Error('יש להזין בין 2 ל־25 נקודות במסלול, כולל התחלה וסיום.');
    result.stops = Array.from(input.stops, text);
    return result;
  }

  function pointsFor(input) {
    const request = fields(input);
    const points = request.stops.map(address => ({role:'stop', address}));
    if (request.start) points.unshift({role:'start', address:request.start});
    if (request.end) points.push({role:'end', address:request.end});
    return points;
  }

  function makeLink(input) {
    const request = fields(input);
    const params = new URLSearchParams({route:'1'});
    if (request.city) params.set('city', request.city);
    for (const point of pointsFor(request)) params.append(point.role, point.address);
    const url = site + '#' + params;
    if (url.length > linkLimit) throw new Error('הקישור ארוך מדי. אפשר להדביק את הרשימה ישירות באתר.');
    return url;
  }

  function parseLink(hash) {
    if (typeof hash !== 'string' || !/(?:^#?|&)route(?:=|&|$)/.test(hash)) return null;
    const raw = hash.replace(/^#/, '');
    if (raw.length + site.length + 1 > linkLimit) throw new Error('הקישור ארוך מדי.');
    try { decodeURIComponent(raw); } catch { throw new Error(invalid); }
    const params = new URLSearchParams(raw);
    const seen = new Set();
    const request = {stops:[]};
    for (const [key, value] of params) {
      if (!['route','city','start','stop','end'].includes(key) || !value.trim() || (key !== 'stop' && seen.has(key))) {
        throw new Error(invalid);
      }
      seen.add(key);
      if (key === 'stop') request.stops.push(value);
      else if (key !== 'route') request[key] = value;
    }
    if (params.get('route') !== '1') throw new Error('גרסת קישור המסלול אינה נתמכת.');
    const valid = fields(request);
    makeLink(valid); // Enforce the limit on the encoded form even when the hash contains literal Unicode.
    return valid;
  }

  function cityKey(name) {
    const key = reference.streetKey(name || '');
    return key === 'netanya' ? 'נתניה' : key;
  }

  function numbered(address, preferredCity) {
    const parts = address.split(',').map(s => s.trim());
    if (parts.length > 1 && /^(?:ישראל|israel)$/i.test(parts[parts.length - 1])) parts.pop();
    if (parts.length > 2 || parts.includes('')) return null;
    if (parts.length === 2 && !/\d/.test(parts[0]) && /\d/.test(parts[1])) parts.reverse();
    let [street, city] = parts;
    if (!city && preferredCity) {
      for (const alias of cityKey(preferredCity) === 'נתניה' ? [preferredCity, 'נתניה', 'Netanya'] : [preferredCity]) {
        if (street.toLowerCase().endsWith(' ' + alias.toLowerCase())) street = street.slice(0, -(alias.length + 1)).trim();
        else if (street.toLowerCase().startsWith(alias.toLowerCase() + ' ')) street = street.slice(alias.length + 1).trim();
      }
    }
    if (city && preferredCity && cityKey(city) !== cityKey(preferredCity)) return null;
    city = city || preferredCity;
    const house = '([1-9]\\d{0,3}(?:[א-תA-Za-z]|[-/]\\d{1,4})?)';
    const tail = street.match(new RegExp('^(.+?)\\s+' + house + '$', 'u'));
    const head = street.match(new RegExp('^' + house + '\\s+(.+)$', 'u'));
    if (!city || (!tail && !head)) return null;
    const name = tail ? tail[1] : head[2];
    if (!/\p{L}/u.test(name)) return null;
    return {street:name, number:tail ? tail[2] : head[1], city};
  }

  function referenceChoices(address, city, dataset) {
    const parsed = numbered(text(address), city ? text(city) : '');
    if (!parsed || !reference.canLookup(parsed.street, parsed.number, parsed.city)) return [];
    const args = [parsed.street, parsed.number, parsed.city, true];
    return dataset ? reference.lookup(dataset, ...args) : localReference?.lookup(...args) || [];
  }

  function autoPick(choices, address, city) {
    if (!Array.isArray(choices) || choices.length !== 1) return null;
    const point = choices[0];
    if (!road.validPoint(point) || point.ambiguous || point.approximate || point.wasNumberStripped ||
        Object.hasOwn(point, 'placeName') || typeof point.mapsAddress !== 'string') return null;
    const query = numbered(address, city);
    const match = numbered(point.mapsAddress);
    if (!query || !match || cityKey(query.city) !== cityKey(match.city) ||
        query.number.toLowerCase() !== match.number.toLowerCase()) return null;
    return reference.stem(reference.streetKey(query.street)) === reference.stem(reference.streetKey(match.street)) ? point : null;
  }

  function duplicateStops(entries, points) {
    const firstRole = new Map();
    const repeated = [];
    for (const [i, point] of points.entries()) {
      const key = point.lat + ',' + point.lng;
      if (!firstRole.has(key)) firstRole.set(key, entries[i].role);
      else if (!(entries[i].role === 'end' && firstRole.get(key) === 'start')) repeated.push(i);
    }
    return repeated;
  }

  function solve(request, points, osrmData, options = {}) {
    const entries = pointsFor(request);
    if (!Array.isArray(points) || points.length !== entries.length || !points.every(road.validPoint)) {
      throw new Error('נדרש מיקום תקין לכל כתובת.');
    }
    if (options.allowRepeatedStops !== true && duplicateStops(entries, points).length) {
      throw new Error('שתי עצירות מפנות לאותה נקודה. יש לבדוק את הרשימה.');
    }
    const matrix = road.durations(osrmData, points.length);
    // Index tokens stay distinct even on a round trip with an identical start and end object.
    const tokens = entries.map((entry, index) => ({role:entry.role, index}));
    const stops = tokens.filter(token => token.role === 'stop');
    const start = tokens.find(token => token.role === 'start');
    const end = tokens.find(token => token.role === 'end');
    const exact = stops.length <= optimizer.MAX_EXACT_STOPS;
    const solver = exact ? optimizer.solveTSP : optimizer.optimizeRouteNearestNeighbor;
    const order = solver(stops, matrix, start, end, tokens).map(token => token.index);
    if (order.length !== entries.length) throw new Error('לא נמצא סדר נסיעה שעובר בכל הכתובות.');
    const seconds = order.slice(1).reduce((sum, next, i) => sum + matrix[order[i]][next], 0);
    if (!Number.isFinite(seconds)) throw new Error('זמן הנסיעה אינו תקין.');
    return {order, exact, seconds};
  }

  return {makeLink, parseLink, pointsFor, referenceChoices, autoPick, duplicateStops, solve, tableUrl:road.tableUrl};
}));
