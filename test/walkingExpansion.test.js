const assert = require("node:assert/strict");

const {
    insert
} = require("../src/spatial/nearestStop");

const {
    createSearchState,
    MinPriorityQueue,
    BestLabels,
    estimateWalking,
    expandWalkingStates
} = require("../src/routing/graph");


const stops = [
    { stopId: "origin", lat: 53.5000, lon: -113.5000 },
    { stopId: "near", lat: 53.5005, lon: -113.5000 },
    { stopId: "edge", lat: 53.5010, lon: -113.5000 },
    { stopId: "far", lat: 53.5100, lon: -113.5000 }
];

let kdTree = null;
const stopById = new Map();

for (const stop of stops) {
    kdTree = insert(kdTree, stop);
    stopById.set(stop.stopId, stop);
}


const estimate = estimateWalking(140, {
    walkingSpeedMetresPerSecond: 1.4,
    detourFactor: 1.2
});

assert.equal(estimate.distanceMetres, 168);
assert.equal(estimate.durationSeconds, 121);


const frontier = new MinPriorityQueue();
const bestLabels = new BestLabels();
const origin = createSearchState({
    stopId: "origin",
    arrivalTimeSeconds: 8 * 3600
});

bestLabels.accept(origin);

const firstExpansion = expandWalkingStates({
    state: origin,
    kdTree,
    stopById,
    frontier,
    bestLabels,
    maximumSegmentMetres: 100,
    maximumTotalWalkingMetres: 500,
    maximumTotalWalkingSeconds: 600
});

assert.deepEqual(
    firstExpansion.acceptedStates.map(state => state.stopId),
    ["near"]
);
assert.equal(firstExpansion.acceptedStates[0].tripId, null);
assert.equal(firstExpansion.acceptedStates[0].action.type, "walk");
assert.equal(frontier.dequeue(), firstExpansion.acceptedStates[0]);


// Running the identical expansion again produces the same candidate label,
// which dominance tracking rejects instead of duplicating in the frontier.
const duplicateExpansion = expandWalkingStates({
    state: origin,
    kdTree,
    stopById,
    frontier,
    bestLabels,
    maximumSegmentMetres: 100
});

assert.equal(duplicateExpansion.acceptedStates.length, 0);
assert.equal(duplicateExpansion.rejected.dominated, 1);


// Expanding from the walked-to state must not create near -> origin, because
// origin is already in its predecessor chain.
const cycleCheck = expandWalkingStates({
    state: firstExpansion.acceptedStates[0],
    kdTree,
    stopById,
    frontier,
    bestLabels,
    maximumSegmentMetres: 100
});

assert.equal(
    cycleCheck.acceptedStates.some(state => state.stopId === "origin"),
    false
);
assert.ok(cycleCheck.rejected.currentOrVisited >= 2);


console.log("Phase 3 walking expansion tests passed.");
