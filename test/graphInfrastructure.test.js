const assert = require("node:assert/strict");

const {
    createSearchState,
    MinPriorityQueue,
    BestLabels,
    reconstructStates,
    reconstructActions
} = require("../src/routing/graph");


function state(overrides = {}) {
    return createSearchState({
        stopId: "100",
        arrivalTimeSeconds: 1000,
        ...overrides
    });
}


// The frontier must return earliest arrivals first and preserve insertion
// order when two states have the same priority.
const queue = new MinPriorityQueue();
const later = state({ stopId: "later", arrivalTimeSeconds: 1200 });
const earlyFirst = state({ stopId: "early-1", arrivalTimeSeconds: 900 });
const earlySecond = state({ stopId: "early-2", arrivalTimeSeconds: 900 });

queue.enqueue(later);
queue.enqueue(earlyFirst);
queue.enqueue(earlySecond);

assert.equal(queue.size, 3);
assert.equal(queue.dequeue(), earlyFirst);
assert.equal(queue.dequeue(), earlySecond);
assert.equal(queue.dequeue(), later);
assert.equal(queue.dequeue(), null);


// A later, otherwise equivalent label is rejected.
const labels = new BestLabels();
const first = state({ arrivalTimeSeconds: 1000 });
const dominated = state({ arrivalTimeSeconds: 1100 });
const fasterWithMoreWalking = state({
    arrivalTimeSeconds: 950,
    walkingSeconds: 300,
    walkingMetres: 350
});

assert.equal(labels.accept(first), true);
assert.equal(labels.accept(dominated), false);

// Neither alternative dominates the other: one arrives earlier, while the
// other uses less walking. Both must remain available for later search rules.
assert.equal(labels.accept(fasterWithMoreWalking), true);
assert.equal(labels.size, 2);


// A genuinely superior label removes an older label and makes an already
// queued state stale.
const improved = state({ arrivalTimeSeconds: 900 });
assert.equal(labels.accept(improved), true);
assert.equal(labels.isCurrent(first), false);
assert.equal(labels.isCurrent(improved), true);
assert.equal(labels.size, 1);


// Being aboard different trips creates different future possibilities, so
// labels at the same physical stop remain separate.
const tripOne = state({ tripId: "trip-1", arrivalTimeSeconds: 800 });
const tripTwo = state({ tripId: "trip-2", arrivalTimeSeconds: 800 });
assert.equal(labels.accept(tripOne), true);
assert.equal(labels.accept(tripTwo), true);


// Predecessors reconstruct the finalized itinerary in forward travel order.
const origin = state({ stopId: "origin", arrivalTimeSeconds: 700 });
const boarded = state({
    stopId: "middle",
    arrivalTimeSeconds: 800,
    routeId: "004",
    tripId: "trip-1",
    boardings: 1,
    previousState: origin,
    action: { type: "transit", routeId: "004" }
});
const destination = state({
    stopId: "destination",
    arrivalTimeSeconds: 850,
    boardings: 1,
    walkingSeconds: 50,
    walkingMetres: 60,
    previousState: boarded,
    action: { type: "walk", durationSeconds: 50 }
});

assert.deepEqual(
    reconstructStates(destination),
    [origin, boarded, destination]
);
assert.deepEqual(
    reconstructActions(destination),
    [
        { type: "transit", routeId: "004" },
        { type: "walk", durationSeconds: 50 }
    ]
);


assert.throws(
    () => state({ arrivalTimeSeconds: -1 }),
    /non-negative/
);

console.log("Phase 2 graph infrastructure tests passed.");
