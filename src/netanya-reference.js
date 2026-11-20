(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetanyaReference = factory();
}(typeof self !== 'undefined' ? self : this, function() {
  let pending;

  function streetKey(street) {
    return street.normalize('NFKC').replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7'"׳״’“”]/gu, '')
      .replace(/[־‐‑–—-]/gu, ' ').trim().replace(/\s+/gu, ' ').toLowerCase();
  }

  function stem(street) {
    return street.replace(/^(?:שדרות|שד|רחוב|רח) /u, '').replace(/יי/g, 'י').replace(/וו/g, 'ו');
  }

  function load() {
    if (!pending) {
      pending = fetch('./data/netanya-addresses.json').then(async response => {
        if (!response.ok) throw new Error('Address reference unavailable');
        return Object.entries(await response.json()).map(([street, houses]) => ({
          street, houses, key: streetKey(street), stem: stem(streetKey(street))
        }));
      }).catch(() => {
        pending = undefined;
        return [];
      });
    }
    return pending;
  }

  async function lookup(street, number, city) {
    if (!['נתניה', 'netanya'].includes((city || '').split(',')[0].trim().toLowerCase()) ||
        !/^[1-9]\d{0,3}(?:[א-תA-Za-z]|[-/]\d{1,4})?$/.test(number) || !street?.trim()) return [];
    const rows = await load();
    const key = streetKey(street);
    const exact = rows.filter(row => row.key === key && Object.hasOwn(row.houses, number));
    const candidates = exact.length ? exact : rows.filter(row => row.stem === stem(key));
    const points = new Map();
    for (const row of candidates) {
      for (const [lat, lng] of row.houses[number] || []) {
        const address = row.street + ' ' + number + ', נתניה';
        points.set(lat + ',' + lng, { lat, lng, address, fullAddress: address + ', ישראל',
          mapsAddress: address + ', ישראל', reference: true });
      }
    }
    const result = [...points.values()];
    if (result.length > 1) result.forEach(point => { point.mapsAddress = null; point.ambiguous = true; });
    return result;
  }

  return {lookup};
}));
