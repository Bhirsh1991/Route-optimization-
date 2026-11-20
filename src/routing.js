(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.routing = factory();
}(typeof self !== 'undefined' ? self : this, function() {
  const MAX_MAPS_WAYPOINTS = 9;
  const MOBILE_WAYPOINTS = 3;
  const MAX_MAPS_URL_LENGTH = 2048;

  async function getOSRMTable(points, signal) {
    const coordinates = points.map(({ lat, lng }) => {
      if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
        throw new Error('לאחת הנקודות אין מיקום תקין. יש לבחור אותה מחדש.');
      }
      return `${lng},${lat}`;
    });
    const url = 'https://router.project-osrm.org/table/v1/driving/' + coordinates.join(';');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('שירות הניתוב לא הצליח לחשב את זמני הנסיעה. אפשר לנסות שוב.');
    const data = await response.json();
    const matrix = data.durations;
    const n = points.length;
    if (data.code !== 'Ok' || !Array.isArray(matrix) || matrix.length !== n ||
        !matrix.every(row => Array.isArray(row) && row.length === n &&
          row.every(value => value === null || (Number.isFinite(value) && value >= 0)))) {
      throw new Error('שירות הניתוב לא החזיר זמני נסיעה תקינים לכל הנקודות.');
    }
    return matrix;
  }

  function directionsUrl(values) {
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', values[0]);
    url.searchParams.set('destination', values[values.length - 1]);
    if (values.length > 2) url.searchParams.set('waypoints', values.slice(1, -1).join('|'));
    url.searchParams.set('travelmode', 'driving');
    return url.href;
  }

  function addressForMaps(point) {
    if (point.approximate || point.wasNumberStripped || /ללא\s+מספר/.test(point.address || '')) return '';
    if (Object.hasOwn(point, 'mapsAddress')) {
      return typeof point.mapsAddress === 'string' ? point.mapsAddress.trim() : '';
    }
    // Older saves only kept Nominatim's full display name. Keep its locality and country.
    if (typeof point.fullAddress !== 'string' || /ללא\s+מספר/.test(point.fullAddress)) return '';
    const parts = point.fullAddress.split(',').map(s => s.trim()).filter(Boolean);
    let street = parts.shift() || '';
    const houseNumber = /^\d+\p{L}?(?:[-/]\d+\p{L}?)?$/u;
    if (houseNumber.test(street)) {
      const number = street;
      street = parts.shift() || '';
      if (!/\p{L}/u.test(street)) return '';
      street = /[\u0590-\u05ff]/.test(street) ? street + ' ' + number : number + ' ' + street;
    } else {
      const words = street.split(/\s+/);
      if (words.length < 2 || !/\p{L}/u.test(street) ||
          (!houseNumber.test(words[0]) && !houseNumber.test(words.at(-1))) ||
          /^(?:כביש|highway|route)\s+\d+$/iu.test(street)) return '';
    }
    const country = parts.pop() || '';
    const localityParts = parts.filter(part => /\p{L}{2}/u.test(part) &&
      !/^(?:מחוז|נפת)\s|\b(?:district|county)\b/iu.test(part));
    if (!localityParts.length || !/\p{L}{2}/u.test(country) || /[;|]/.test(street)) return '';
    return [street, ...new Set(localityParts), country].join(', ');
  }

  function mapStops(points) {
    const coordinatesByName = new Map();
    const stops = points.map(point => {
      const coords = point.lat + ',' + point.lng;
      const name = addressForMaps(point);
      const key = name.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
      if (!coordinatesByName.has(key)) coordinatesByName.set(key, coords);
      else if (coordinatesByName.get(key) !== coords) coordinatesByName.set(key, null);
      return {point, name, key, coords};
    });
    for (const stop of stops) {
      // A pipe separates waypoints in the decoded Maps URL.
      if (stop.name.includes('|') || coordinatesByName.get(stop.key) === null) stop.name = '';
    }
    return stops;
  }

  function mapsLink(stops, exact) {
    if (stops.length < 2 || stops.length > MAX_MAPS_WAYPOINTS + 2) return null;
    const values = stops.map(stop => (!exact && stop.name) || stop.coords);
    let url = directionsUrl(values);
    if (url.length > MAX_MAPS_URL_LENGTH) {
      // Substituting the longest encoded names first preserves the most readable stops.
      const size = text => new URLSearchParams({v: text}).toString().length;
      const savings = values.map((value, index) => ({index, bytes: size(value) - size(stops[index].coords)}));
      savings.sort((a, b) => b.bytes - a.bytes);
      for (const {index, bytes} of savings) {
        if (bytes <= 0 || url.length <= MAX_MAPS_URL_LENGTH) break;
        values[index] = stops[index].coords;
        url = directionsUrl(values);
      }
    }
    return {url, usesCoordinates: values.some((value, i) => value === stops[i].coords)};
  }

  function mapsUrl(points, exact = points.length > 2) {
    return mapsLink(mapStops(points), exact)?.url || null;
  }

  function mobileSegments(points) {
    const segments = [];
    for (let first = 0; first < points.length - 1; first += MOBILE_WAYPOINTS + 1) {
      segments.push(points.slice(first, first + MOBILE_WAYPOINTS + 2));
    }
    return segments;
  }

  function mapsLinks(points, exact = points.length > 2) {
    const stops = mapStops(points);
    const full = mapsLink(stops, exact);
    const segments = mobileSegments(stops).map(segment => ({
      ...mapsLink(segment, exact), start: segment[0].point, end: segment[segment.length - 1].point
    }));
    return {
      exact,
      fullUrl: full?.url || null,
      hasAddresses: stops.some(stop => stop.name),
      usesCoordinates: full ? full.usesCoordinates : segments.some(s => s.usesCoordinates),
      namedLegs: !exact && stops.length > 2 ? stops.slice(1).map((to, i) => ({
        url: mapsLink([stops[i], to], false).url, destination: to.point.address
      })) : [],
      segments
    };
  }

  return { getOSRMTable, mapsUrl, mapsLinks, mobileSegments };
}));
