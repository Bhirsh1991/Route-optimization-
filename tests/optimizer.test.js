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
