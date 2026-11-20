const {validRoute, restoreOrder, snapshot, sameInputs} = require('../src/planner-state');

const point = i => ({lat: 30 + i, lng: 35, address: String(i)});
const [s, a, b, e] = [0, 1, 2, 3].map(point);
const saved = snapshot(s, [b, a], e, [s, a, b, e]);

test('restores the exact computed order from JSON using the current input objects', () => {
    const read = JSON.parse(JSON.stringify(saved));
    expect(restoreOrder(read)).toEqual([s, a, b, e]);
    expect(restoreOrder(read)[1]).toBe(read.intermediateLocations[1]);
    expect(restoreOrder({...read, optimizedOrder: [0, 1, 1, 3]})).toEqual([]);
    expect(restoreOrder({...read, optimizedOrder: [2, 1, 0, 3]})).toEqual([]);
});

test('supports legacy named saves, a free start, free end and round trips', () => {
    const legacy = {startLocation: null, intermediateLocations: [a, b], endLocation: null};
    expect(validRoute(legacy)).toBe(true);
    expect(restoreOrder(legacy)).toEqual([]);
    expect(restoreOrder(snapshot(null, [a, b], null, [b, a]))).toEqual([b, a]);
    const homeAgain = {...s};
    expect(restoreOrder(snapshot(s, [a], homeAgain, [s, a, homeAgain]))).toEqual([s, a, homeAgain]);
});

test('validates positions, role and stop order before restoring or marking saved', () => {
    expect(validRoute({...saved, intermediateLocations: [{...a, lng: 205}]})).toBe(false);
    expect(validRoute({...saved, startLocation: {address: 'missing coordinates'}})).toBe(false);
    expect(sameInputs(saved, JSON.parse(JSON.stringify(saved)))).toBe(true);
    expect(sameInputs(saved, snapshot(s, [a, b], e, []))).toBe(false);
    expect(sameInputs(saved, snapshot(null, [s, b, a], e, []))).toBe(false);
});
