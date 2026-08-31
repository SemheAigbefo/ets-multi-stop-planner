const assert = require("node:assert/strict");

const {
    createSearchState,
    MinPriorityQueue,
    BestLabels,
    expandTransitStates,
    gtfsTimeToSeconds,
    secondsToGtfsTime
} = require("../src/routing/graph");


assert.equal(gtfsTimeToSeconds("25:10:00"), 90600);
assert.equal(secondsToGtfsTime(90600), "25:10:00");


const stopById = new Map([
    ["A", { stopId: "A", routes: [{ routeId: "R" }] }],
    ["B", {
        stopId: "B",
        routes: [{ routeId: "R" }, { routeId: "S" }]
    }],
    ["C", { stopId: "C", routes: [{ routeId: "R" }] }],
    ["D", { stopId: "D", routes: [{ routeId: "S" }] }]
]);

const tripsByRoute = new Map([
    ["R", [
        {
            tripId: "missed",
            serviceId: "weekday",
            headsign: "Too early"
        },
        {
            tripId: "r-active",
            serviceId: "weekday",
            headsign: "Route R"
        },
        {
            tripId: "inactive",
            serviceId: "weekend",
            headsign: "Wrong service"
        }
    ]],
    ["S", [
        {
            tripId: "s-too-soon",
            serviceId: "weekday",
            headsign: "Missed transfer"
        },
        {
            tripId: "s-valid",
            serviceId: "weekday",
            headsign: "Route S"
        }
    ]]
]);

const stopTimesByTrip = new Map([
    ["missed", [
        { stopId: "A", departureTime: "07:50:00", arrivalTime: "07:50:00" },
        { stopId: "B", departureTime: "07:55:00", arrivalTime: "07:55:00" }
    ]],
    ["r-active", [
        { stopId: "A", departureTime: "08:05:00", arrivalTime: "08:05:00" },
        { stopId: "B", departureTime: "08:10:00", arrivalTime: "08:10:00" },
        { stopId: "C", departureTime: "08:20:00", arrivalTime: "08:20:00" }
    ]],
    ["inactive", [
        { stopId: "A", departureTime: "08:01:00", arrivalTime: "08:01:00" },
        { stopId: "C", departureTime: "08:02:00", arrivalTime: "08:02:00" }
    ]],
    ["s-too-soon", [
        { stopId: "B", departureTime: "08:12:00", arrivalTime: "08:12:00" },
        { stopId: "D", departureTime: "08:25:00", arrivalTime: "08:25:00" }
    ]],
    ["s-valid", [
        { stopId: "B", departureTime: "08:20:00", arrivalTime: "08:20:00" },
        { stopId: "D", departureTime: "08:35:00", arrivalTime: "08:35:00" }
    ]]
]);

const serviceByDate = new Map([
    ["20260826", new Set(["weekday"])]
]);

const frontier = new MinPriorityQueue();
const bestLabels = new BestLabels();
const origin = createSearchState({
    stopId: "A",
    arrivalTimeSeconds: gtfsTimeToSeconds("08:00:00")
});

bestLabels.accept(origin);

const firstExpansion = expandTransitStates({
    state: origin,
    travelDate: "20260826",
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    frontier,
    bestLabels
});

assert.deepEqual(
    firstExpansion.acceptedStates.map(state => state.stopId),
    ["B", "C"]
);
assert.equal(firstExpansion.rejected.departed, 1);
assert.equal(firstExpansion.rejected.inactiveService, 1);
assert.equal(firstExpansion.acceptedStates[0].boardings, 1);
assert.equal(firstExpansion.acceptedStates[0].transfers, 0);
assert.equal(firstExpansion.acceptedStates[0].action.waitSeconds, 300);


const stateAtB = frontier.dequeue();
assert.equal(stateAtB.stopId, "B");

const transferExpansion = expandTransitStates({
    state: stateAtB,
    travelDate: "20260826",
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    frontier,
    bestLabels,
    minimumTransferSeconds: 300
});

const stateAtD = transferExpansion.acceptedStates.find(
    state => state.stopId === "D"
);

assert.ok(stateAtD);
assert.equal(stateAtD.tripId, "s-valid");
assert.equal(stateAtD.boardings, 2);
assert.equal(stateAtD.transfers, 1);
assert.equal(stateAtD.action.departureTime, "08:20:00");
assert.equal(
    transferExpansion.acceptedStates.some(
        state => state.tripId === "s-too-soon"
    ),
    false
);


const noService = expandTransitStates({
    state: origin,
    travelDate: "20990101",
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    frontier,
    bestLabels
});

assert.equal(noService.noActiveService, true);
assert.equal(noService.acceptedStates.length, 0);


console.log("Phase 4 transit expansion tests passed.");
