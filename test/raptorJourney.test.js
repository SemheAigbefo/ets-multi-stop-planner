const assert = require("node:assert/strict");
const planRaptorJourney = require("../src/routing/raptor/planRaptorJourney");
const {
    isOrsQuotaError
} = require("../src/routing/transitCentres/planHierarchicalTransfer");
const stops = ["A", "B", "C"].map(stopId => ({ stopId, lat: 53.5,
    lon: -113.5, routes: stopId === "A" ? [{ routeId: "1" }]
        : stopId === "B" ? [{ routeId: "1" }, { routeId: "2" }]
            : [{ routeId: "2" }] }));
const result = planRaptorJourney({
    originStopIds: ["A"], destinationStopIds: ["C"],
    departureTimeSeconds: 28800, travelDate: "20260701", kdTree: null,
    stopById: new Map(stops.map(s => [s.stopId, s])),
    tripsByRoute: new Map([["1", [{ tripId: "t1", serviceId: "active" }]],
        ["2", [{ tripId: "t2", serviceId: "active" }]]]),
    stopTimesByTrip: new Map([["t1", [
        { stopId: "A", departureTime: "08:05:00", arrivalTime: "08:05:00" },
        { stopId: "B", departureTime: "08:15:00", arrivalTime: "08:15:00" }]],
        ["t2", [
        { stopId: "B", departureTime: "08:21:00", arrivalTime: "08:21:00" },
        { stopId: "C", departureTime: "08:35:00", arrivalTime: "08:35:00" }]]]),
    serviceByDate: new Map([["20260701", new Set(["active"])]]),
    minimumTransferSeconds: 300
});
assert.equal(result.success, true);
assert.equal(result.routingEngine, "raptor");
assert.equal(result.arrivalTime, "08:35:00");
assert.deepEqual(result.itinerary.map(a => a.routeId), ["1", "2"]);

const retried = planRaptorJourney({
    originStopIds: ["A"], destinationStopIds: ["B"],
    originLocation: { lat: 53.5, lon: -113.5 },
    departureTimeSeconds: 28800, travelDate: "20260701", kdTree: null,
    stopById: new Map(stops.map(s => [s.stopId, s])),
    tripsByRoute: new Map([["1", [
        { tripId: "too-early", serviceId: "active" },
        { tripId: "catchable", serviceId: "active" }
    ]]]),
    stopTimesByTrip: new Map([
        ["too-early", [
            { stopId: "A", departureTime: "08:05:00", arrivalTime: "08:05:00" },
            { stopId: "B", departureTime: "08:15:00", arrivalTime: "08:15:00" }
        ]],
        ["catchable", [
            { stopId: "A", departureTime: "08:10:00", arrivalTime: "08:10:00" },
            { stopId: "B", departureTime: "08:20:00", arrivalTime: "08:20:00" }
        ]]
    ]),
    serviceByDate: new Map([["20260701", new Set(["active"])]]),
    originWalkOverridesByStopId: new Map([["A", {
        type: "walk", kind: "origin_access", fromStopId: null, toStopId: "A",
        distanceMetres: 400, durationSeconds: 360, estimated: false
    }]])
});
assert.equal(retried.success, true);
assert.equal(retried.itinerary.find(action => action.type === "transit").tripId,
    "catchable");

const closeBoardingStops = [
    { stopId: "FAR", lat: 53.5, lon: -113.5, routes: [{ routeId: "3" }] },
    { stopId: "CLOSE", lat: 53.5, lon: -113.5, routes: [{ routeId: "3" }] },
    { stopId: "END", lat: 53.5, lon: -113.5, routes: [{ routeId: "3" }] }
];
const closerBoarding = planRaptorJourney({
    originStopIds: ["FAR", "CLOSE"], destinationStopIds: ["END"],
    originLocation: { lat: 53.5, lon: -113.5 },
    departureTimeSeconds: 36000, travelDate: "20260701", kdTree: null,
    stopById: new Map(closeBoardingStops.map(stop => [stop.stopId, stop])),
    tripsByRoute: new Map([["3", [{ tripId: "same-bus", serviceId: "active" }]]]),
    stopTimesByTrip: new Map([["same-bus", [
        { stopId: "FAR", departureTime: "10:27:00", arrivalTime: "10:27:00" },
        { stopId: "CLOSE", departureTime: "10:27:00", arrivalTime: "10:27:00" },
        { stopId: "END", departureTime: "10:40:00", arrivalTime: "10:40:00" }
    ]]]),
    serviceByDate: new Map([["20260701", new Set(["active"])]]),
    originWalkOverridesByStopId: new Map([
        ["FAR", { type: "walk", kind: "origin_access", fromStopId: null,
            toStopId: "FAR", distanceMetres: 386, durationSeconds: 276 }],
        ["CLOSE", { type: "walk", kind: "origin_access", fromStopId: null,
            toStopId: "CLOSE", distanceMetres: 110, durationSeconds: 79 }]
    ])
});
assert.equal(closerBoarding.success, true);
assert.equal(closerBoarding.itinerary.find(action => action.type === "transit").fromStopId,
    "CLOSE");
assert.equal(isOrsQuotaError(new Error("Quota exceeded")), true);
assert.equal(isOrsQuotaError(new Error("status 429")), true);
assert.equal(isOrsQuotaError(new Error("Invalid GTFS data")), false);
console.log("RAPTOR journey tests passed.");
