const originalFetch = global.fetch;
const street = 'שדרות אתמר בן-אב"י';
const city = 'עיר לדוגמה';
const query = 'שדרות בן אבי 12';
const road = (name, town = city, lat = '32.32') => ({
  display_name: name + ', ' + town, category: 'highway', lat, lon: '34.86',
  address: {road: name, town, country: 'ישראל'}
});
const house = (name, num, town, lat) => {
  const item = road(name, town, lat);
  item.display_name = num + ', ' + item.display_name;
  item.address.house_number = num;
  return item;
};
let findAddresses;

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  ({ findAddresses } = require('../src/geocode'));
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

function mock(replies) {
  const calls = [];
  global.fetch = jest.fn(async href => {
    calls.push(new URL(href));
    if (!replies.length) throw new Error('Unexpected lookup');
    const data = replies.shift();
    return {ok: true, json: async () => data};
  });
  return calls;
}

test('does not suggest a town centre as a street or as a confirmed house', async () => {
  const center = {display_name: 'עיר לדוגמה, ישראל', lat: '32.3', lon: '34.9', address: {town: city}};
  mock([[center], [center], [center]]);
  expect(await find(query, {city})).toEqual([]);
});

async function find(text, area) {
  const pending = findAddresses(text, true, () => true, area);
  await jest.runAllTimersAsync();
  return pending;
}

test('discovers a longer punctuated street name, checks its house and keeps the qualified label', async () => {
  const calls = mock([[], [road('בן אליעזר'), road(street), road(street)], [house(street, '12')]]);
  const results = await find(query, {city});
  expect(calls).toHaveLength(3);
  expect(calls[0].searchParams.get('q')).toBe(query + ', ' + city);
  expect(calls[1].searchParams.get('street')).toBe('בן');
  expect(calls[2].searchParams.get('street')).toBe('12 ' + street);
  expect(results).toHaveLength(1);
  expect(results[0].mapsAddress).toBe(street + ' 12, ' + city + ', ישראל');
  expect(results[0].approximate).toBeUndefined();
});

test('keeps only the approximate road if the provider returns a different house number', async () => {
  const calls = mock([[house(street,'14')], [road(street), road(street)], [house(street,'14')]]);
  const results = await find(query, {city});
  expect(calls).toHaveLength(3);
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({approximate:true, mapsAddress:null});
  expect(results[0].fullAddress).not.toMatch(/14/);
});

test('coarse GPS resolves a local exact building before a distant direct match', async () => {
  const calls = mock([[house(street, '12', 'עיר רחוקה', '30')], {address:{town:city,country_code:'il'}},
    [road(street)], [house(street, '12')]]);
  const results = await find(query, {lat:32.321234, lng:34.858765});
  expect(calls[0].searchParams.has('viewbox')).toBe(true);
  expect(calls[0].searchParams.has('bounded')).toBe(false);
  expect(calls[1].pathname).toBe('/reverse');
  expect(calls[1].searchParams.get('lat')).toBe('32.32');
  expect(calls[1].searchParams.get('lon')).toBe('34.86');
  expect(results[0].mapsAddress).toContain(city);
});

test('preserves the distant exact choice when the biased search finds no local road', async () => {
  mock([[house(street, '12', 'עיר רחוקה','30')], {address:{town:city,country_code:'il'}}, [], []]);
  const results = await find(query, {lat:32.32,lng:34.86});
  expect(results).toHaveLength(1);
  expect(results[0].mapsAddress).toContain('עיר רחוקה');
});

test('an explicit city overrides a saved city and coordinates', async () => {
  const calls = mock([[house(street, '12')]]);
  await find(query + ', ' + city, {city:'עיר אחרת',lat:30,lng:30});
  expect(calls[0].searchParams.get('q')).toBe(query + ', ' + city);
  expect(calls[0].searchParams.has('viewbox')).toBe(false);
});

test('using the same qualified name at different pins falls back to coordinates', async () => {
  mock([[house(street, '12', city,'32.31'),house(street,'12',city,'32.32')]]);
  const rows = await find(query, {city});
  expect(rows.map(r => r.mapsAddress)).toEqual([null,null]);
});
