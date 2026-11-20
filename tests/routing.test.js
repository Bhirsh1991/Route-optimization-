const { getOSRMTable, mapsUrl, mapsLinks, mobileSegments } = require('../src/routing');

const locations = Array.from({ length: 16 }, (_, i) => ({lat: 31 + i / 100, lng: 35}));
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function values(url) {
  const params = new URL(url).searchParams;
  const via = params.get('waypoints');
  return [params.get('origin'), ...(via ? via.split('|') : []), params.get('destination')];
}

test('defaults to pinned stops for the full trip and every segment, with qualified names available in the same order', () => {
  const stops = locations.slice(0, 7).map((point, i) => ({...point, mapsAddress: 'רחוב לדוגמה ' + i + ', עיר בדיקה'}));
  const names = mapsLinks(stops, false);
  expect(values(names.fullUrl)).toEqual(stops.map(p => p.mapsAddress));
  expect(values(names.segments[0].url)).toEqual(stops.slice(0, 5).map(p => p.mapsAddress));
  expect(values(names.segments[1].url)).toEqual(stops.slice(4).map(p => p.mapsAddress));
  expect(names.usesCoordinates).toBe(false);
  const exact = mapsLinks(stops);
  expect(exact.exact).toBe(true);
  expect(mapsUrl(stops)).toBe(exact.fullUrl);
  expect(values(exact.fullUrl)).toEqual(stops.map(p => p.lat + ',35'));
  expect(values(exact.segments[1].url)).toEqual(stops.slice(4).map(p => p.lat + ',35'));
  const direct = mapsLinks([stops[0], stops[6]]);
  expect(direct.exact).toBe(false);
  expect(values(direct.fullUrl)).toEqual([stops[0].mapsAddress, stops[6].mapsAddress]);
  expect(direct.namedLegs).toEqual([]);
  expect(values(mapsUrl([stops[0], stops[6]], true))).toEqual(['31,35', '31.06,35']);
});

test('ambiguous, legacy and approximate locations keep the selected map point, including across segments', () => {
  const stops = locations.slice(0, 7).map((point, i) => ({...point, mapsAddress: 'Example ' + i + ', Test Town'}));
  stops[6].mapsAddress = stops[0].mapsAddress;
  stops[1].approximate = true;
  delete stops[2].mapsAddress;
  stops[3].mapsAddress = 'A|B, Test Town';
  const names = mapsLinks(stops, false);
  expect(values(names.fullUrl)).toEqual(stops.map((p, i) => i === 4 || i === 5 ? p.mapsAddress : p.lat + ',35'));
  expect(values(names.segments[0].url)[0]).toBe(stops[0].lat + ',35');
  expect(values(names.segments[1].url).at(-1)).toBe(stops[6].lat + ',35');
  expect(names.usesCoordinates).toBe(true);
  const expected = values(names.fullUrl);
  expect(names.namedLegs.map(leg => values(leg.url))).toEqual(expected.slice(1).map((v, i) => [expected[i], v]));
});

test('long Unicode addresses are shortened to coordinates where necessary without losing stops', () => {
  const stops = locations.slice(0, 7).map((point, i) => ({...point, mapsAddress: 'דרך לדוגמה ' + i + ', עיר בדיקה'}));
  stops[2].mapsAddress = 'דרך '.repeat(210) + 'ארוכה';
  const links = mapsLinks(stops, false);
  expect([links.fullUrl, ...links.segments.map(s => s.url)].every(url => url.length <= 2048)).toBe(true);
  expect(values(links.fullUrl)).toEqual(stops.map((p, i) => i === 2 ? p.lat + ',35' : p.mapsAddress));
  expect(links.usesCoordinates).toBe(true);
});

test('older Nominatim records with a house, street, locality and country export readable addresses', () => {
  const stops = [
    {...locations[0], fullAddress: '12, Example Street, Sample City, Testland'},
    {...locations[1], fullAddress: 'רחוב הבדיקה 4, עיר בדיקה, ישראל'},
    {...locations[2], fullAddress: '7, רחוב המדגם, עיר בדיקה, עיר בדיקה, נפת השרון, מחוז המרכז, 4210201, ישראל'}
  ];
  expect(values(mapsUrl(stops, false))).toEqual(['12 Example Street, Sample City, Testland',
    'רחוב הבדיקה 4, עיר בדיקה, ישראל', 'רחוב המדגם 7, עיר בדיקה, ישראל']);
});

test.each([
  {fullAddress: '12, Example Street, Testland'},
  {fullAddress: 'Example Street, Sample City, Testland'},
  {fullAddress: '12, Example Street, 12000, Testland'},
  {fullAddress: '12, Example Street, Test District, Testland'},
  {fullAddress: 'Highway 12, Sample City, Testland'},
  {fullAddress: '12, Example Street, Sample City, Testland', wasNumberStripped: true},
  {fullAddress: '12, Example Street, Sample City, Testland', address: 'דוגמה (ללא מספר)'},
  {fullAddress: '12, Example Street, Sample City, Testland', address: 'דוגמה (ללא מספר בית מאומת)'},
  {fullAddress: '12, Example Street, Sample City, Testland', mapsAddress: null}
])('ambiguous legacy addresses and explicitly rejected new labels keep their original point', details => {
  expect(values(mapsUrl([{...locations[0], ...details}, locations[1]]))[0]).toBe('31,35');
});

test('keeps five waypoints in the single app URL and also creates mobile segments', () => {
  const trip = locations.slice(0, 7);
  const url = new URL(mapsUrl(trip));
  expect(url.searchParams.get('origin')).toBe('31,35');
  expect(url.searchParams.get('destination')).toBe('31.06,35');
  expect(url.searchParams.get('waypoints').split('|')).toEqual(trip.slice(1, -1).map(p => p.lat + ',35'));
  expect(mobileSegments(trip)).toEqual([trip.slice(0, 5), trip.slice(4)]);
});

test('segments beyond the nine-waypoint app cap preserve order and share an endpoint', () => {
  expect(mapsUrl(locations.slice(0, 11))).not.toBeNull();
  expect(mapsUrl(locations.slice(0, 12))).toBeNull();
  const segments = mobileSegments(locations);
  expect(segments.every(segment => segment.length >= 2 && segment.length <= 5)).toBe(true);
  expect(segments.flatMap((segment, i) => i === 0 ? segment : segment.slice(1))).toEqual(locations);
  expect(segments.slice(1).every((segment, i) => segment[0] === segments[i].at(-1))).toBe(true);
});

test('passes cancellation through to OSRM and accepts directed matrices with missing roads', async () => {
  const durations = [[0, null], [8, 0]];
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({code: 'Ok', durations}) });
  const signal = new AbortController().signal;
  await expect(getOSRMTable(locations.slice(0, 2), signal)).resolves.toEqual(durations);
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/driving/35,31;35,31.01'), {signal});
});

test.each([
  {code: 'NoTable', durations: [[0, 1], [2, 0]]},
  {code: 'Ok', durations: [[0, 1]]},
  {code: 'Ok', durations: [[0, -1], [2, 0]]},
  {code: 'Ok', durations: [[0, '1'], [2, 0]]}
])('rejects unsuccessful or malformed OSRM matrices', async payload => {
  global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => payload});
  await expect(getOSRMTable(locations.slice(0, 2))).rejects.toThrow();
});
