const {linkFor, destinations} = require('../src/waze');

const point = i => ({lat: 30 + i / 100, lng: 34, address: 'Stop ' + i});
const [start, first, second, end] = [0, 1, 2, 3].map(point);

test('fixed origin is skipped, the order and the return destination are retained', () => {
  expect(destinations([start, first, second, end], true)).toEqual([first, second, end]);
  expect(destinations([start, first, start], true)).toEqual([first, start]);
  expect(destinations([start, end], true)).toEqual([end]);
});

test('without a fixed origin the first point is a navigation destination', () => {
  expect(destinations([first, second, end], false)).toEqual([first, second, end]);
});

test('Waze deep links include only the selected coordinates and navigation flag', () => {
  const url = new URL(linkFor({...first, fullAddress: 'Private', phone: 'Private'}));
  expect(url.origin + url.pathname).toBe('https://waze.com/ul');
  expect(Object.fromEntries(url.searchParams)).toEqual({ll: '30.01,34', navigate: 'yes'});
  expect(linkFor({lat: NaN, lng: 34})).toBeNull();
  expect(linkFor({lat: 15, lng: 181})).toBeNull();
});
