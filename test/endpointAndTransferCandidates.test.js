const assert = require("node:assert/strict");
const {
    insert
} = require("../src/spatial/nearestStop");
const selectEndpointStops =
    require("../src/spatial/selectEndpointStops");
const {
    findNearbyTransferPairs
} = require("../src/routing/transfers/findNearbyTransferPairs");


const endpointStops = [
    {
        stopId: "eastbound-bay",
        lat: 53.5001,
        lon: -113.5000,
        routes: [{ routeId: "004" }]
    },
    {
        stopId: "westbound-bay",
        lat: 53.5002,
        lon: -113.5000,
        routes: [{ routeId: "004" }]
    },
    {
        stopId: "third-stop",
        lat: 53.5004,
        lon: -113.5000,
        routes: [{ routeId: "008" }]
    },
    {
        stopId: "far-stop",
        lat: 53.5200,
        lon: -113.5000,
        routes: [{ routeId: "009" }]
    }
];

let endpointTree = null;

for (const stop of endpointStops) {
    endpointTree = insert(endpointTree, stop);
}

const selected = selectEndpointStops({
    kdTree: endpointTree,
    lat: 53.5000,
    lon: -113.5000,
    radiusMetres: 100,
    maximumStops: 10
});

assert.deepEqual(
    selected.stops.map(stop => stop.stopId),
    ["eastbound-bay", "westbound-bay", "third-stop"]
);
assert.ok(
    selected.stops[0].endpointDistanceMetres <
    selected.stops[1].endpointDistanceMetres
);
assert.equal(selected.usedNearestFallback, false);

const capped = selectEndpointStops({
    kdTree: endpointTree,
    lat: 53.5000,
    lon: -113.5000,
    radiusMetres: 100,
    maximumStops: 2
});

assert.deepEqual(
    capped.stops.map(stop => stop.stopId),
    ["eastbound-bay", "westbound-bay"]
);

const fallback = selectEndpointStops({
    kdTree: endpointTree,
    lat: 53.5300,
    lon: -113.5000,
    radiusMetres: 1,
    maximumStops: 5
});

assert.equal(fallback.stops.length, 1);
assert.equal(fallback.stops[0].stopId, "far-stop");
assert.equal(fallback.usedNearestFallback, true);


const firstExitStops = [
    { stopId: "A1", lat: 53.5100, lon: -113.5000 },
    { stopId: "A2", lat: 53.5200, lon: -113.5000 },
    // Duplicate input must not produce a duplicate A1|B1 pair.
    { stopId: "A1", lat: 53.5100, lon: -113.5000 }
];

const secondBoardingStops = [
    { stopId: "B1", lat: 53.5103, lon: -113.5000 },
    { stopId: "B2", lat: 53.5204, lon: -113.5000 },
    { stopId: "B-far", lat: 53.5500, lon: -113.5000 }
];

const pairs = findNearbyTransferPairs({
    firstExitStops,
    secondBoardingStops,
    maximumStraightLineMetres: 100,
    maximumPairsPerExit: 10
});

assert.deepEqual(
    pairs.map(pair =>
        `${pair.firstExitStopId}|${pair.secondBoardingStopId}`
    ),
    ["A1|B1", "A2|B2"]
);
assert.equal(
    pairs.every(
        pair => pair.pedestrianVerification === "pending_ors"
    ),
    true
);
assert.equal(
    pairs.some(pair => pair.secondBoardingStopId === "B-far"),
    false
);


console.log("Endpoint and KD-tree transfer candidate tests passed.");
