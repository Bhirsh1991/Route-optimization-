const originalFetch = global.fetch;
const town = 'עיר בדיקה';
const name = 'שדרות הדמיון';
const ref = {lat: 32.3201, lng: 34.85, reference: true, address: 'שדרות הדמיון 27, עיר בדיקה'};

function point(lat, road = name, city = town, category = 'place') {
  return {lat, lon: 34.85, category, name: category === 'shop' ? 'חנות לדוגמה' : '',
    display_name: '27, ' + road + ', ' + city, address: {road, city, house_number: '27', suburb: 'רובע לדוגמה'}};
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

async function run(query, area, reply, reference = []) {
  jest.doMock('../src/netanya-reference', () => ({lookup: async () => reference}));
  global.fetch = jest.fn(async href => ({ok: true, json: async () => reply(new URL(href))}));
  const {findAddresses} = require('../src/geocode');
  const result = findAddresses(query, true, () => true, area);
  await jest.runAllTimersAsync();
  return result;
}

test.each(['הדמיון 27, עיר בדיקה', 'עיר בדיקה, הדמיון 27', 'עיר בדיקה הדמיון 27', 'הדמיון 27 עיר בדיקה', '27 הדמיון, עיר בדיקה'])(
  'identifies the independently corroborated pin in the requested town for %s', async query => {
    const rows = await run(query, {city: town}, () => [
      point(32.33, name + ';הדמיון'), point(32.3202, name, town, 'shop'), point(32.3200),
      point(32.32, name, 'עיר אחרת')
    ], [ref]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({lat: 32.32, referenceMatched: true, mapsAddress: null});
    expect(rows[0].approximate).toBeUndefined();
  });

test('matches an individual semicolon alias and keeps distant uncorroborated pins distinguishable', async () => {
  const rows = await run('הדמיון 27', {city:town}, () => [point(32.33, name + ';הדמיון'), point(32.32)]);
  expect(rows.map(p => p.lat).sort()).toEqual([32.32,32.33]);
  expect(rows.every(p => p.ambiguous && p.mapsAddress === null)).toBe(true);
});

test('looks up the precise number for a single-word street before offering a street-only result', async () => {
  const rows = await run('הדמיון 27', {city:town}, url =>
    url.searchParams.get('street') === '27 הדמיון' ? [point(32.32)] : []);
  expect(rows[0]).toMatchObject({lat:32.32, mapsAddress:name + ' 27, ' + town});
});

test('does not repeat a house number when it is already part of a street alias', async () => {
  const one = await run('הדמיון 27', {city:town}, () => [point(32.32, name + ';הדמיון 27')]);
  expect(one[0].mapsAddress).toBe(name + ' 27, ' + town);
});

test('shows distant street name variants in the same town for confirmation', async () => {
  const two = await run('הדמיון 27', {city:town}, () => [point(32.32, name), point(32.33, 'הדמיון')]);
  expect(two).toHaveLength(2);
  expect(two.every(p => p.ambiguous && p.mapsAddress === null)).toBe(true);
});

test('does not route to another town on an explicitly city-qualified lookup', async () => {
  const rows = await run('הדמיון 27', {city:town}, () => [point(32.32, name, 'עיר אחרת')]);
  expect(rows).toEqual([]);
});

test('GPS lookup checks the city if a regional result lists multiple street aliases', async () => {
  const rows = await run('הדמיון 27', {lat:32.33,lng:34.85}, url => {
    if (url.pathname === '/reverse') return {address: {city:town, country_code:'il'}};
    if (url.searchParams.get('city') === town) return [point(32.32), point(32.33, name+';הדמיון')];
    return [point(32.33, name+';הדמיון')];
  }, [ref]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({lat:32.32, referenceMatched:true});
});
