const assert = require("node:assert/strict");
const buildTransitCentreEndpoints =
    require("../src/routing/transitCentres/buildTransitCentreEndpoints");
const {
    findTransitCentrePath
} = require("../src/routing/transitCentres/findTransitCentrePath");


const stopById = new Map([
    ["O", { stopId: "O", name: "Origin", routes: [{ routeId: "1" }] }],
    ["A", { stopId: "A", name: "Alpha Transit Centre",
        routes: [{ routeId: "1" }, { routeId: "2" }] }],
    ["B", { stopId: "B", name: "Beta Transit Centre",
        routes: [{ routeId: "2" }, { routeId: "3" }] }],
    ["D", { stopId: "D", name: "Destination", routes: [{ routeId: "3" }] }]
]);

const centreByStopId = new Map([
    ["A", "alpha"],
    ["B", "beta"]
]);

const tripsByRoute = new Map([
    ["1", [{ tripId: "origin-access", serviceId: "weekday" }]],
    ["2", [{ tripId: "centre-link", serviceId: "weekday" }]],
    ["3", [
        { tripId: "missed-egress", serviceId: "weekday" },
        { tripId: "valid-egress", serviceId: "weekday" }
    ]]
]);

const stopTimesByTrip = new Map([
    ["origin-access", [
        { stopId: "O", stopSequence: 1,
            departureTime: "08:05:00", arrivalTime: "08:05:00" },
        { stopId: "A", stopSequence: 2,
            departureTime: "08:15:00", arrivalTime: "08:15:00" }
    ]],
    ["centre-link", [
        { stopId: "A", stopSequence: 1,
            departureTime: "08:21:00", arrivalTime: "08:21:00" },
        { stopId: "B", stopSequence: 2,
            departureTime: "08:30:00", arrivalTime: "08:30:00" }
    ]],
    ["missed-egress", [
        { stopId: "B", stopSequence: 1,
            departureTime: "08:32:00", arrivalTime: "08:32:00" },
        { stopId: "D", stopSequence: 2,
            departureTime: "08:42:00", arrivalTime: "08:42:00" }
    ]],
    ["valid-egress", [
        { stopId: "B", stopSequence: 1,
            departureTime: "08:36:00", arrivalTime: "08:36:00" },
        { stopId: "D", stopSequence: 2,
            departureTime: "08:46:00", arrivalTime: "08:46:00" }
    ]]
]);

const serviceByDate = new Map([
    ["20260831", new Set(["weekday"])]
]);

const endpoints = buildTransitCentreEndpoints({
    originStopIds: ["O"],
    destinationStopIds: ["D"],
    departureTimeSeconds: 8 * 3600,
    travelDate: "20260831",
    stopById,
    centreByStopId,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    destinationDistanceByStopId: new Map([["D", 120]])
});

assert.equal(endpoints.startStates.length, 1);
assert.equal(endpoints.startStates[0].centreId, "alpha");
assert.equal(endpoints.startStates[0].access.tripId, "origin-access");
assert.deepEqual([...endpoints.destinationCentreIds], ["beta"]);
assert.equal(
    endpoints.destinationConnectionsByCentreId.get("beta").length,
    2
);

const graph = new Map([
    ["alpha", new Map([
        ["beta", {
            fromCentreId: "alpha",
            toCentreId: "beta",
            routeIds: new Set(["2"]),
            connections: [{
                routeId: "2",
                tripId: "centre-link",
                serviceId: "weekday",
                boardingStopId: "A",
                arrivalStopId: "B",
                departureTime: "08:21:00",
                arrivalTime: "08:30:00"
            }]
        }]
    ])],
    ["beta", new Map()]
]);

const path = findTransitCentrePath({
    graph,
    ...endpoints,
    travelDate: "20260831",
    serviceByDate,
    minimumTransferSeconds: 300
});

assert.equal(path.success, true);
assert.deepEqual(path.centres, ["alpha", "beta"]);
assert.equal(path.startingAccess.tripId, "origin-access");
assert.equal(path.destinationEgress.tripId, "valid-egress");
assert.equal(path.arrivalTimeSeconds, 8 * 3600 + 46 * 60);

console.log("Transit-centre endpoint connection tests passed.");
