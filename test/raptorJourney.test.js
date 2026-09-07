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
assert.equal(isOrsQuotaError(new Error("Quota exceeded")), true);
assert.equal(isOrsQuotaError(new Error("status 429")), true);
assert.equal(isOrsQuotaError(new Error("Invalid GTFS data")), false);
console.log("RAPTOR journey tests passed.");
