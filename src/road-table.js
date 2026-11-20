(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoadTable = factory();
}(typeof self !== 'undefined' ? self : this, function() {
  function validPoint(point) {
    return point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
      Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
  }

  function tableUrl(points) {
    if (!Array.isArray(points) || points.length < 2 || !points.every(validPoint)) {
      throw new Error('לאחת הנקודות אין מיקום תקין. יש לבחור אותה מחדש.');
    }
    return 'https://router.project-osrm.org/table/v1/driving/' + points.map(p => p.lng + ',' + p.lat).join(';');
  }

  function durations(data, n) {
    const matrix = data?.durations;
    if (data?.code !== 'Ok' || !Array.isArray(matrix) || matrix.length !== n ||
        !matrix.every(row => Array.isArray(row) && row.length === n &&
          row.every(value => value === null || (Number.isFinite(value) && value >= 0)))) {
      throw new Error('שירות הניתוב לא החזיר זמני נסיעה תקינים לכל הנקודות.');
    }
    return matrix;
  }

  return {validPoint, tableUrl, durations};
}));
