const assert = require("assert");
const { trimShapeToStops } = require("../src/routing/shapeGeometry");

const points = [
    { lat: 53.0, lon: -113.0 },
    { lat: 53.1, lon: -113.1 },
    { lat: 53.2, lon: -113.2 },
    { lat: 53.3, lon: -113.3 }
];
const result = trimShapeToStops(points,
    { lat: 53.09, lon: -113.09 },
    { lat: 53.31, lon: -113.31 });
assert.deepStrictEqual(result, points.slice(1).map(({ lat, lon }) => ({ lat, lon })));
assert.deepStrictEqual(trimShapeToStops([], {}, {}), []);
console.log("Shape geometry tests passed.");
