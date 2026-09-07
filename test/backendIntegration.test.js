const assert = require("node:assert/strict");
const planMultiStopTrip =
    require("../src/routing/planMultiStopTrip");
const {
    insert
} = require("../src/spatial/nearestStop");


const stops = [
    { stopId: "A", name: "Origin", lat: 53.5000, lon: -113.5000,
        routes: [{ routeId: "R" }] },
    { stopId: "B", name: "Arrival bay", lat: 53.5100, lon: -113.5000,
        routes: [{ routeId: "R" }] },
    { stopId: "X", name: "Walking transfer bay", lat: 53.5104, lon: -113.5000,
        routes: [{ routeId: "S" }] },
    { stopId: "D", name: "First destination", lat: 53.5200, lon: -113.5000,
        routes: [{ routeId: "S" }, { routeId: "T" }] },
    { stopId: "E", name: "Second destination", lat: 53.5300, lon: -113.5000,
        routes: [{ routeId: "T" }] }
];

let kdTree = null;
const stopById = new Map();

for (const stop of stops) {
    kdTree = insert(kdTree, stop);
    stopById.set(stop.stopId, stop);
}

const tripsByRoute = new Map([
    ["R", [{ tripId: "trip-r", serviceId: "weekday" }]],
    ["S", [{ tripId: "trip-s", serviceId: "weekday" }]],
    ["T", [{ tripId: "trip-t", serviceId: "weekday" }]]
]);

const stopTimesByTrip = new Map([
    ["trip-r", [
        { stopId: "A", departureTime: "08:05:00", arrivalTime: "08:05:00" },
        { stopId: "B", departureTime: "08:10:00", arrivalTime: "08:10:00" }
    ]],
    ["trip-s", [
        { stopId: "X", departureTime: "08:17:00", arrivalTime: "08:17:00" },
        { stopId: "D", departureTime: "08:30:00", arrivalTime: "08:30:00" }
    ]],
    ["trip-t", [
        { stopId: "D", departureTime: "08:40:00", arrivalTime: "08:40:00" },
        { stopId: "E", departureTime: "08:50:00", arrivalTime: "08:50:00" }
    ]]
]);

const serviceByDate = new Map([
    ["20260826", new Set(["weekday"])]
]);

const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
        return {
            routes: [{
                duration: "60s",
                distanceMeters: 80,
                polyline: { encodedPolyline: "verified-polyline" }
            }]
        };
    }
});


async function run() {
    const routingStop = stop => ({
        name: stop.name,
        stopIds: [stop.stopId],
        routes: stop.routes,
        physicalStops: [stop]
    });

    const result = await planMultiStopTrip({
        routeStops: [
            { routingStop: routingStop(stops[0]) },
            {
                routingStop: routingStop(stops[3]),
                preferredDepartureTime: "08:35:00"
            },
            { routingStop: routingStop(stops[4]) }
        ],
        travelDate: "20260826",
        initialDepartureTime: "08:00:00",
        kdTree,
        stopById,
        tripsByRoute,
        stopTimesByTrip,
        serviceByDate,
        walkingOptions: {
            maximumSegmentMetres: 100,
            maximumTotalWalkingMetres: 500
        },
        verifyWalking: true,
        googleRoutesApiKey: "test-key",
        fetchImpl
    });

    assert.equal(result.success, true);
    assert.equal(result.legs.length, 2);
    assert.deepEqual(result.itineraryTypes, ["transfer", "direct"]);
    assert.equal(result.journeyType, "mixed");
    assert.equal(result.legs[0].arrivalTime, "08:30:00");
    assert.equal(result.legs[0].itinerary.walkingMetres, 80);
    assert.equal(
        result.legs[0].itinerary.itinerary[1].encodedPolyline,
        "verified-polyline"
    );
    assert.equal(result.legs[1].preferenceStatus, "not_requested");
    assert.equal(result.legs[1].searchedFrom, "08:30:00");
    assert.equal(result.finalArrivalTime, "08:50:00");

    // Internal predecessor chains are intentionally excluded from API data.
    assert.equal(
        Object.hasOwn(result.legs[0].routingDetails.graphJourney, "states"),
        false
    );

    console.log("Phase 7 backend integration tests passed.");
}


run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
