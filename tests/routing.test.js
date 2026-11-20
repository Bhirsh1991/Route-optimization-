const { getOSRMTable, mapsUrl, mobileSegments } = require('../src/routing');

const locations = Array.from({ length: 16 }, (_, i) => ({lat: 31 + i / 100, lng: 35}));
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

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
