(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var exports = factory();
    root.MAX_EXACT_STOPS = exports.MAX_EXACT_STOPS;
    root.generatePermutations = exports.generatePermutations;
    root.solveTSP = exports.solveTSP;
    root.optimizeRouteNearestNeighbor = exports.optimizeRouteNearestNeighbor;
  }
}(typeof self !== 'undefined' ? self : this, function() {
  function generatePermutations(arr) {
    const result = [];
    function permute(current, remaining) {
      if (remaining.length === 0) {
        result.push(current);
        return;
      }
      for (let i = 0; i < remaining.length; i++) {
        const next = remaining[i];
        const newRemaining = remaining.slice(0, i).concat(remaining.slice(i + 1));
        permute(current.concat(next), newRemaining);
      }
    }
    permute([], arr);
    return result;
  }

  const MAX_EXACT_STOPS = 14;

  function getCosts(intermediate, matrix, start, end, all) {
    const indices = new Map(all.map((point, index) => [point, index]));
    function cost(from, to) {
      const duration = matrix?.[indices.get(from)]?.[indices.get(to)];
      return Number.isFinite(duration) && duration >= 0 ? duration : Infinity;
    }
    return {
      first: intermediate.map(point => start ? cost(start, point) : 0),
      last: intermediate.map(point => end ? cost(point, end) : 0),
      between: intermediate.map(from => intermediate.map(to => cost(from, to))),
      direct: start && end ? cost(start, end) : 0
    };
  }

  function withEndpoints(stops, start, end) {
    const route = stops.slice();
    if (start) route.unshift(start);
    if (end) route.push(end);
    return route;
  }

  function solveTSP(intermediate, matrix, start, end, all) {
    const n = intermediate.length;
    if (n > MAX_EXACT_STOPS) throw new RangeError('Too many stops for the exact solver');
    const costs = getCosts(intermediate, matrix, start, end, all);
    if (!n) return Number.isFinite(costs.direct) ? withEndpoints([], start, end) : [];

    // Held–Karp: cheapest suffix from each stop through the remaining subset to the end.
    const subsets = 1 << n;
    const best = new Float64Array(subsets * n).fill(Infinity);
    const nextStop = new Int8Array(subsets * n).fill(-1);
    best.set(costs.last);
    for (let mask = 1; mask < subsets; mask++) {
      for (let from = 0; from < n; from++) {
        if (mask & (1 << from)) continue;
        const state = mask * n + from;
        for (let bits = mask; bits; bits &= bits - 1) {
          const bit = bits & -bits;
          const to = 31 - Math.clz32(bit);
          const candidate = costs.between[from][to] + best[(mask ^ bit) * n + to];
          if (candidate < best[state]) {
            best[state] = candidate;
            nextStop[state] = to;
          }
        }
      }
    }

    let remaining = subsets - 1;
    let current = -1;
    let minimum = Infinity;
    for (let i = 0; i < n; i++) {
      const total = costs.first[i] + best[(remaining ^ (1 << i)) * n + i];
      if (total < minimum) {
        minimum = total;
        current = i;
      }
    }
    if (current === -1) return [];
    const order = [];
    while (remaining) {
      order.push(intermediate[current]);
      remaining ^= 1 << current;
      current = nextStop[remaining * n + current];
    }
    return withEndpoints(order, start, end);
  }

  function optimizeRouteNearestNeighbor(intermediate, matrix, start, end, all) {
    const costs = getCosts(intermediate, matrix, start, end, all);
    if (!intermediate.length) return Number.isFinite(costs.direct) ? withEndpoints([], start, end) : [];

    const unvisited = new Set(intermediate.keys());
    const ordered = [];
    let from = -1;
    while (unvisited.size) {
      const available = from === -1 ? costs.first : costs.between[from];
      let nearest = -1;
      let minimum = Infinity;
      for (const next of unvisited) {
        if (available[next] < minimum) {
          nearest = next;
          minimum = available[next];
        }
      }
      if (nearest === -1) return [];
      unvisited.delete(nearest);
      ordered.push(intermediate[nearest]);
      from = nearest;
    }
    return Number.isFinite(costs.last[from]) ? withEndpoints(ordered, start, end) : [];
  }

  return {
    MAX_EXACT_STOPS,
    generatePermutations,
    solveTSP,
    optimizeRouteNearestNeighbor
  };
}));
