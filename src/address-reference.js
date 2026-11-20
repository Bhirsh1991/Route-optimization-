(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AddressReference = factory();
}(typeof self !== 'undefined' ? self : this, function() {
  function streetKey(street) {
    return street.normalize('NFKC').replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7'"׳״’“”]/gu, '')
      .replace(/[־‐‑–—-]/gu, ' ').trim().replace(/\s+/gu, ' ').toLowerCase();
  }

  function stem(street) {
    return street.replace(/^(?:שדרות|שד|רחוב|רח) /u, '').replace(/יי/g, 'י').replace(/וו/g, 'ו');
  }

  function canLookup(street, number, city) {
    return ['נתניה', 'netanya'].includes((city || '').split(',')[0].trim().toLowerCase()) &&
      /^[1-9]\d{0,3}(?:[א-תA-Za-z]|[-/]\d{1,4})?$/.test(number) && Boolean(street?.trim());
  }

  const indexes = new WeakMap();
  function rowsFor(dataset) {
    if (!indexes.has(dataset)) {
      const rows = Object.entries(dataset).map(([street, houses]) => {
        const key = streetKey(street);
        return {street, houses, key, stem: stem(key)};
      });
      indexes.set(dataset, rows);
    }
    return indexes.get(dataset);
  }

  function lookup(dataset, street, number, city, includeVariants = false) {
    if (!dataset || !canLookup(street, number, city)) return [];
    const rows = rowsFor(dataset);
    const key = streetKey(street);
    const exact = rows.filter(row => row.key === key && Object.hasOwn(row.houses, number));
    const candidates = exact.length && !includeVariants ? exact : rows.filter(row => row.stem === stem(key));
    const points = new Map();
    for (const row of candidates) {
      for (const [lat, lng] of row.houses[number] || []) {
        const address = row.street + ' ' + number + ', נתניה';
        points.set(lat + ',' + lng, {lat, lng, address, fullAddress: address + ', ישראל',
          mapsAddress: address + ', ישראל', reference: true});
      }
    }
    const result = [...points.values()];
    if (result.length > 1) result.forEach(point => { point.mapsAddress = null; point.ambiguous = true; });
    return result;
  }

  return {canLookup, lookup, streetKey, stem};
}));
