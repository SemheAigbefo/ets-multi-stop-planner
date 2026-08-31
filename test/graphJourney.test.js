const assert = require("node:assert/strict");

const {
    insert
} = require("../src/spatial/nearestStop");

const {
    planGraphJourney
} = require("../src/routing/graph");


/*
 * A and B share Route R. B and X do not share a route or a name, but they
 * are within walking distance. X then serves Route S to destination D.
 */
const stops = [
    {
        stopId: "A",
        name: "Origin",
        lat: 53.5000,
        lon: -113.5000,
        routes: [{ routeId: "R" }]
    },
    {
        stopId: "B",
        name: "First arrival stop",
        lat: 53.5100,
        lon: -113.5000,
        routes: [{ routeId: "R" }]
    },
    {
        stopId: "X",
        name: "Nearby transfer stop",
        lat: 53.5104,
        lon: -113.5000,
        routes: [{ routeId: "S" }]
    },
    {
        stopId: "D",
        name: "Destination",
        lat: 53.5200,
        lon: -113.5000,
        routes: [{ routeId: "S" }]
    }
];

let kdTree = null;
const stopById = new Map();

for (const stop of stops) {
    kdTree = insert(kdTree, stop);
    stopById.set(stop.stopId, stop);
}

const tripsByRoute = new Map([
    ["R", [{
        tripId: "trip-r",
        serviceId: "weekday",
        headsign: "First bus"
    }]],
    ["S", [{
        tripId: "trip-s",
        serviceId: "weekday",
        headsign: "Second bus"
    }]]
]);

const stopTimesByTrip = new Map([
    ["trip-r", [
        {
            stopId: "A",
            departureTime: "08:05:00",
            arrivalTime: "08:05:00"
        },
        {
            stopId: "B",
            departureTime: "08:10:00",
            arrivalTime: "08:10:00"
        }
    ]],
    ["trip-s", [
        {
            stopId: "X",
            departureTime: "08:17:00",
            arrivalTime: "08:17:00"
        },
        {
            stopId: "D",
            departureTime: "08:30:00",
            arrivalTime: "08:30:00"
        }
    ]]
]);

const serviceByDate = new Map([
    ["20260826", new Set(["weekday"])]
]);

const result = planGraphJourney({
    originStopIds: ["A"],
    destinationStopIds: ["D"],
    travelDate: "20260826",
    departureTime: "08:00:00",
    kdTree,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    walking: {
        maximumSegmentMetres: 100,
        maximumTotalWalkingMetres: 500,
        maximumTotalWalkingSeconds: 600
    },
    transit: {
        minimumTransferSeconds: 300
    }
});

assert.equal(result.success, true);
assert.equal(result.arrivalTime, "08:30:00");
assert.equal(result.destinationStopId, "D");
assert.equal(result.boardings, 2);
assert.equal(result.transfers, 1);
assert.deepEqual(
    result.itinerary.map(action => action.type),
    ["transit", "walk", "transit"]
);
assert.equal(result.itinerary[0].fromStopId, "A");
assert.equal(result.itinerary[0].toStopId, "B");
assert.equal(result.itinerary[1].fromStopId, "B");
assert.equal(result.itinerary[1].toStopId, "X");
assert.equal(result.itinerary[2].fromStopId, "X");
assert.equal(result.itinerary[2].toStopId, "D");


const unreachable = planGraphJourney({
    originStopIds: ["A"],
    destinationStopIds: ["D"],
    travelDate: "20990101",
    departureTime: "08:00:00",
    kdTree,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    walking: {
        maximumSegmentMetres: 100
    }
});

assert.equal(unreachable.success, false);
assert.equal(unreachable.reason, "destination_unreachable");


// Regression: the nearest stop to the true destination has no useful route,
// while another nearby stop is served by the bus. The search must use all
// destination-area candidates and include the final walk to the real point.
const destinationStops = [
    {
        stopId: "O",
        lat: 53.5000,
        lon: -113.5000,
        routes: [{ routeId: "Q" }]
    },
    {
        stopId: "N",
        lat: 53.5200,
        lon: -113.5000,
        routes: []
    },
    {
        stopId: "C",
        lat: 53.5185,
        lon: -113.5000,
        routes: [{ routeId: "Q" }]
    }
];

let destinationTree = null;
const destinationStopById = new Map();

for (const stop of destinationStops) {
    destinationTree = insert(destinationTree, stop);
    destinationStopById.set(stop.stopId, stop);
}

const destinationResult = planGraphJourney({
    originStopIds: ["O"],
    destinationStopIds: ["N", "C"],
    destinationLocation: {
        lat: 53.5201,
        lon: -113.5000
    },
    travelDate: "20260826",
    departureTime: "09:00:00",
    kdTree: destinationTree,
    stopById: destinationStopById,
    tripsByRoute: new Map([
        ["Q", [{ tripId: "trip-q", serviceId: "weekday" }]]
    ]),
    stopTimesByTrip: new Map([
        ["trip-q", [
            {
                stopId: "O",
                departureTime: "09:05:00",
                arrivalTime: "09:05:00"
            },
            {
                stopId: "C",
                departureTime: "09:25:00",
                arrivalTime: "09:25:00"
            }
        ]]
    ]),
    serviceByDate,
    walking: {
        maximumSegmentMetres: 300,
        maximumTotalWalkingMetres: 600
    }
});

assert.equal(destinationResult.success, true);
assert.equal(
    destinationResult.itinerary.some(
        action => action.type === "transit" && action.routeId === "Q"
    ),
    true
);
const finalAction = destinationResult.itinerary.at(-1);
assert.equal(finalAction.type, "walk");
assert.equal(finalAction.toStopId, null);
assert.deepEqual(finalAction.toLocation, {
    lat: 53.5201,
    lon: -113.5000
});


console.log("Phase 5 complete graph journey tests passed.");
