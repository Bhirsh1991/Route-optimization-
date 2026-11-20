(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.routing = factory();
}(typeof self !== 'undefined' ? self : this, function() {
  const MAX_MAPS_WAYPOINTS = 9;
  const MOBILE_WAYPOINTS = 3;

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

  function mapsUrl(points) {
    if (points.length < 2 || points.length > MAX_MAPS_WAYPOINTS + 2) return null;
    const coords = points.map(location => `${location.lat},${location.lng}`);
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', coords[0]);
    url.searchParams.set('destination', coords[coords.length - 1]);
    if (coords.length > 2) url.searchParams.set('waypoints', coords.slice(1, -1).join('|'));
    url.searchParams.set('travelmode', 'driving');
    return url.href;
  }

  function mobileSegments(points) {
    const segments = [];
    for (let first = 0; first < points.length - 1; first += MOBILE_WAYPOINTS + 1) {
      segments.push(points.slice(first, first + MOBILE_WAYPOINTS + 2));
    }
    return segments;
  }

  return { getOSRMTable, mapsUrl, mobileSegments };
}));
