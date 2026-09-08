function squaredDistance(point, stop) {
    const lat = Number(stop.lat);
    const lon = Number(stop.lon);
    const longitudeScale = Math.cos(lat * Math.PI / 180);
    return (point.lat - lat) ** 2 + ((point.lon - lon) * longitudeScale) ** 2;
}

function nearestPointIndex(points, stop, startIndex = 0) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let index = startIndex; index < points.length; index += 1) {
        const distance = squaredDistance(points[index], stop);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    }
    return bestIndex;
}

function trimShapeToStops(points, fromStop, toStop) {
    if (!Array.isArray(points) || points.length < 2 || !fromStop || !toStop) return [];
    const fromIndex = nearestPointIndex(points, fromStop);
    const toIndex = nearestPointIndex(points, toStop, fromIndex);
    if (fromIndex < 0 || toIndex < fromIndex) return [];
    return points.slice(fromIndex, toIndex + 1)
        .map(({ lat, lon }) => ({ lat, lon }));
}

module.exports = { trimShapeToStops };
