const { generatePermutations, solveTSP, optimizeRouteNearestNeighbor } = require('../src/optimizer');

describe('generatePermutations', () => {
  test('returns all permutations of array', () => {
    const perms = generatePermutations([1,2,3]);
    expect(perms).toHaveLength(6);
    const expected = [
      [1,2,3],[1,3,2],
      [2,1,3],[2,3,1],
      [3,1,2],[3,2,1]
    ];
    expect(perms).toEqual(expect.arrayContaining(expected));
  });
});

function createMatrix(points) {
  const dist = (a,b) => Math.hypot(a.lat-b.lat, a.lng-b.lng);
  return points.map(p1 => points.map(p2 => dist(p1,p2)));
}

describe('solveTSP and optimizeRouteNearestNeighbor', () => {
  const start = { address: 'start', lat: 0, lng: 0 };
  const a = { address: 'A', lat: 1, lng: 1 };
  const b = { address: 'B', lat: 2, lng: 2 };
  const end = { address: 'end', lat: 3, lng: 3 };
  const all = [start, a, b, end];
  const matrix = createMatrix(all);
  const intermediate = [a, b];

  test('solveTSP finds optimal route', () => {
    const route = solveTSP(intermediate, matrix, start, end, all);
    expect(route).toEqual([start, a, b, end]);
  });

  test('optimizeRouteNearestNeighbor chooses reasonable route', () => {
    const route = optimizeRouteNearestNeighbor(intermediate, matrix, start, end, all);
    expect(route).toEqual([start, a, b, end]);
  });
});

describe.each([solveTSP, optimizeRouteNearestNeighbor])('%p on incomplete road networks', solve => {
  const points = ['start', 'A', 'B', 'end'];
  test('rejects disconnected endpoints, including routes with no intermediate stop', () => {
    expect(solve([], [[0, null], [1, 0]], 'start', 'end', ['start', 'end'])).toEqual([]);
  });
  test('does not skip a stop or append an unreachable destination', () => {
    const chain = [[0,1,null,null], [null,0,1,null], [null,null,0,1], [null,null,null,0]];
    expect(solve(['A','B'], chain, 'start', 'end', points)).toEqual(points);
    chain[2][3] = null;
    expect(solve(['A','B'], chain, 'start', 'end', points)).toEqual([]);
    chain[1][2] = null;
    expect(solve(['A','B'], chain, 'start', null, points)).toEqual([]);
  });
});

test.each([[null, null], ['start', null], [null, 'end'], ['start', 'end']])(
  'exact solver matches brute force on directed roads with start=%s and end=%s', (start, end) => {
    const stops = ['A', 'B', 'C', 'D', 'E'];
    const points = ['E', 'start', 'C', 'A', 'end', 'D', 'B'];
    const matrix = points.map((_, from) => points.map((_, to) => {
      if (from === to) return 0;
      return (3 * from + to) % 5 === 0 ? null : (7 * from + 3 * to) % 12;
    }));
    const duration = route => route.slice(1).reduce((total, point, i) =>
      total + (matrix[points.indexOf(route[i])][points.indexOf(point)] ?? Infinity), 0);
    const optimal = Math.min(...generatePermutations(stops).map(order =>
      duration([start, ...order, end].filter(Boolean))));
    const result = solveTSP(stops, matrix, start, end, points);
    expect(result.slice(start ? 1 : 0, end ? -1 : undefined).sort()).toEqual(stops);
    if (start) expect(result[0]).toBe(start);
    if (end) expect(result.at(-1)).toBe(end);
    expect(duration(result)).toBe(optimal);
  }
);

test('solves 14 intermediate stops exactly and guards the bitmask memory limit', () => {
  const points = Array.from({ length: 16 }, (_, i) => ({lat: i, lng: 0}));
  const route = solveTSP(points.slice(1, -1).reverse(), createMatrix(points), points[0], points[15], points);
  expect(route).toEqual(points);
  expect(() => solveTSP(points, [], null, null, points)).toThrow(RangeError);
});
