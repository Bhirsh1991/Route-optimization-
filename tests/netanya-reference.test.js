const originalFetch = global.fetch;
let lookup;

beforeEach(() => {
  jest.resetModules();
  ({lookup} = require('../src/netanya-reference'));
});
afterEach(() => { global.fetch = originalFetch; });
const data = {
  'שד הניסוי': {'12': [[32.31, 34.85]], '12א': [[32.3101, 34.85]]},
  'הניסוי': {'12': [[32.31, 34.85]]},
  'שדרות המבחן': {'7': [[32.3, 34.85], [32.301, 34.85]]}
};
const response = {ok:true, json:async () => data};

test('restricts downloads to exact numbered addresses in the city; retries failed loads', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ok:false}).mockResolvedValue(response);
  await expect(lookup('שדרות הניסוי', '12', 'חיפה')).resolves.toEqual([]);
  await expect(lookup('שדרות הניסוי', '', 'נתניה')).resolves.toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  await expect(lookup('שדרות הניסוי', '12', 'נתניה')).resolves.toEqual([]);
  const [a, b] = await Promise.all([lookup('שד׳ הניסוי', '12', 'נתניה'), lookup('שדרות הניסוי', '12', 'נתניה')]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(a).toHaveLength(1);
  expect(a[0]).toMatchObject({lat:32.31, lng:34.85, reference:true});
  expect(b[0]).toMatchObject({lat:a[0].lat, lng:a[0].lng});
});

test('preserves house suffixes, conflicting positions and the complete street name', async () => {
  global.fetch = jest.fn().mockResolvedValue(response);
  expect((await lookup('הניסוי', '12א', 'נתניה'))[0].lat).toBe(32.3101);
  expect(await lookup('הניסוי', '12ב', 'נתניה')).toEqual([]);
  expect(await lookup('הניסוי הישן', '12', 'נתניה')).toEqual([]);
  const alternatives = await lookup('המבחן', '7', 'Netanya');
  expect(alternatives).toHaveLength(2);
  expect(alternatives.every(p => p.ambiguous && p.mapsAddress === null)).toBe(true);
});
