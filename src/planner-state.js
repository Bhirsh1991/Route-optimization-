(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PlannerState = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    function points(route) {
        return [route.startLocation, ...route.intermediateLocations, route.endLocation].filter(Boolean);
    }

    function validPoint(point) {
        return point && typeof point.address === 'string' && point.address.trim().length > 0 &&
            Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
            Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
    }

    function validRoute(route) {
        return route && (route.startLocation == null || validPoint(route.startLocation)) &&
            (route.endLocation == null || validPoint(route.endLocation)) &&
            Array.isArray(route.intermediateLocations) && route.intermediateLocations.every(validPoint);
    }

    function restoreOrder(route) {
        const all = points(route);
        const order = route.optimizedOrder;
        if (!Array.isArray(order) || order.length < 2 || order.length !== all.length ||
            !order.every(i => Number.isInteger(i) && i >= 0 && i < all.length) ||
            new Set(order).size !== all.length ||
            (route.startLocation && order[0] !== 0) ||
            (route.endLocation && order[order.length - 1] !== all.length - 1)) return [];
        return order.map(i => all[i]);
    }

    function snapshot(startLocation, intermediateLocations, endLocation, optimized) {
        const route = {startLocation, intermediateLocations: [...intermediateLocations], endLocation};
        const all = points(route);
        route.optimizedOrder = optimized.map(point => all.indexOf(point));
        if (!restoreOrder(route).length) route.optimizedOrder = [];
        return route;
    }

    function sameInputs(a, b) {
        const key = p => p ? [p.lat, p.lng, p.address] : null;
        const signature = r => JSON.stringify([key(r.startLocation), r.intermediateLocations.map(key), key(r.endLocation)]);
        return signature(a) === signature(b);
    }

    return {validRoute, restoreOrder, snapshot, sameInputs};
}));
