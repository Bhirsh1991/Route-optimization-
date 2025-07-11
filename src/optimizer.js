(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var exports = factory();
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

  function solveTSP(intermediateLocs, durationsMatrix, startLoc, endLoc, allPointsForMatrix) {
    if (intermediateLocs.length === 0) {
      const route = [];
      if (startLoc) route.push(startLoc);
      if (endLoc && (route.length === 0 || route[route.length - 1] !== endLoc)) route.push(endLoc);
      return route;
    }

    const permutations = generatePermutations(intermediateLocs);
    let bestRoute = [];
    let minTotalDuration = Infinity;

    for (const perm of permutations) {
      let currentTotalDuration = 0;
      let currentPath = [];

      if (startLoc) {
        currentPath.push(startLoc);
      }

      currentPath = currentPath.concat(perm);

      if (endLoc) {
        currentPath.push(endLoc);
      }

      for (let i = 0; i < currentPath.length - 1; i++) {
        const fromPoint = currentPath[i];
        const toPoint = currentPath[i + 1];

        const fromIdx = allPointsForMatrix.indexOf(fromPoint);
        const toIdx = allPointsForMatrix.indexOf(toPoint);

        if (fromIdx === -1 || toIdx === -1 || !durationsMatrix[fromIdx] || durationsMatrix[fromIdx][toIdx] === undefined) {
          currentTotalDuration = Infinity;
          break;
        }
        currentTotalDuration += durationsMatrix[fromIdx][toIdx];
      }

      if (currentTotalDuration < minTotalDuration) {
        minTotalDuration = currentTotalDuration;
        bestRoute = currentPath;
      }
    }
    return bestRoute;
  }

  function optimizeRouteNearestNeighbor(intermediateLocs, durationsMatrix, startLoc, endLoc, allPointsForMatrix) {
    let currentRoute = [];
    let unvisitedIntermediateIndices = Array.from({ length: intermediateLocs.length }, (_, i) => i);

    let currentPoint = null;
    let currentPointMatrixIndex = -1;

    if (startLoc) {
      currentRoute.push(startLoc);
      currentPoint = startLoc;
      currentPointMatrixIndex = allPointsForMatrix.indexOf(startLoc);
    } else if (intermediateLocs.length > 0) {
      currentPoint = intermediateLocs[0];
      currentRoute.push(currentPoint);
      currentPointMatrixIndex = allPointsForMatrix.indexOf(currentPoint);
      unvisitedIntermediateIndices = unvisitedIntermediateIndices.filter(idx => intermediateLocs[idx] !== currentPoint);
    } else {
      if (endLoc && (currentRoute.length === 0 || currentRoute[currentRoute.length - 1] !== endLoc)) {
        currentRoute.push(endLoc);
      }
      return currentRoute;
    }

    while (unvisitedIntermediateIndices.length > 0) {
      let nearestIntermediateIdx = -1;
      let minDuration = Infinity;

      for (let i = 0; i < unvisitedIntermediateIndices.length; i++) {
        const nextIntermediatePoint = intermediateLocs[unvisitedIntermediateIndices[i]];
        const nextIntermediateMatrixIndex = allPointsForMatrix.indexOf(nextIntermediatePoint);

        if (currentPointMatrixIndex === -1 || nextIntermediateMatrixIndex === -1 ||
            !durationsMatrix[currentPointMatrixIndex] || durationsMatrix[currentPointMatrixIndex][nextIntermediateMatrixIndex] === undefined) {
          continue;
        }

        const duration = durationsMatrix[currentPointMatrixIndex][nextIntermediateMatrixIndex];

        if (duration < minDuration) {
          minDuration = duration;
          nearestIntermediateIdx = unvisitedIntermediateIndices[i];
        }
      }

      if (nearestIntermediateIdx !== -1) {
        const nextPoint = intermediateLocs[nearestIntermediateIdx];
        currentRoute.push(nextPoint);
        currentPoint = nextPoint;
        currentPointMatrixIndex = allPointsForMatrix.indexOf(currentPoint);
        unvisitedIntermediateIndices = unvisitedIntermediateIndices.filter(idx => idx !== nearestIntermediateIdx);
      } else {
        break;
      }
    }

    if (endLoc && (currentRoute.length === 0 || currentRoute[currentRoute.length - 1] !== endLoc)) {
      currentRoute.push(endLoc);
    }

    return currentRoute;
  }

  return {
    generatePermutations,
    solveTSP,
    optimizeRouteNearestNeighbor
  };
}));
