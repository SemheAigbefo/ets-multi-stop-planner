const assert = require("node:assert/strict");
const buildDirectionalTransferSets =
    require("../src/routing/transfers/buildDirectionalTransferSets");
const buildDirectionalTransferCandidates =
    require("../src/routing/transfers/buildDirectionalTransferCandidates");


const stops = [
    { stopId: "O", lat: 53.50, lon: -113.50,
        routes: [{ routeId: "R" }] },
    { stopId: "A-east", lat: 53.51, lon: -113.50,
        routes: [{ routeId: "R" }] },
    { stopId: "A-west", lat: 53.49, lon: -113.50,
        routes: [{ routeId: "R" }] },
    { stopId: "B", lat: 53.52, lon: -113.50,
        routes: [{ routeId: "S" }] },
    { stopId: "D", lat: 53.53, lon: -113.50,
        routes: [{ routeId: "S" }] }
];

const stopById = new Map(
    stops.map(stop => [stop.stopId, stop])
);

const tripsByRoute = new Map([
    ["R", [
        {
            tripId: "r-east",
            serviceId: "weekday",
            directionId: "0",
            headsign: "Eastbound"
        },
        {
            tripId: "r-west",
            serviceId: "weekday",
            directionId: "1",
            headsign: "Westbound"
        },
        {
            tripId: "r-missed",
            serviceId: "weekday",
            directionId: "0",
            headsign: "Already departed"
        }
    ]],
    ["S", [
        {
            tripId: "s-toward-destination",
            serviceId: "weekday",
            directionId: "0",
            headsign: "To destination"
        },
        {
            tripId: "s-away-from-destination",
            serviceId: "weekday",
            directionId: "1",
            headsign: "Away from destination"
        }
    ]]
]);

const stopTimesByTrip = new Map([
    ["r-east", [
        { stopId: "O", stopSequence: 1,
            departureTime: "08:05:00", arrivalTime: "08:05:00" },
        { stopId: "A-east", stopSequence: 2,
            departureTime: "08:15:00", arrivalTime: "08:15:00" }
    ]],
    ["r-west", [
        { stopId: "O", stopSequence: 1,
            departureTime: "08:07:00", arrivalTime: "08:07:00" },
        { stopId: "A-west", stopSequence: 2,
            departureTime: "08:17:00", arrivalTime: "08:17:00" }
    ]],
    ["r-missed", [
        { stopId: "O", stopSequence: 1,
            departureTime: "07:55:00", arrivalTime: "07:55:00" },
        { stopId: "A-east", stopSequence: 2,
            departureTime: "08:00:00", arrivalTime: "08:00:00" }
    ]],
    ["s-toward-destination", [
        { stopId: "B", stopSequence: 1,
            departureTime: "08:30:00", arrivalTime: "08:30:00" },
        { stopId: "D", stopSequence: 2,
            departureTime: "08:45:00", arrivalTime: "08:45:00" }
    ]],
    ["s-away-from-destination", [
        { stopId: "D", stopSequence: 1,
            departureTime: "08:20:00", arrivalTime: "08:20:00" },
        { stopId: "B", stopSequence: 2,
            departureTime: "08:35:00", arrivalTime: "08:35:00" }
    ]]
]);

const serviceByDate = new Map([
    ["20260830", new Set(["weekday"])]
]);

const result = buildDirectionalTransferSets({
    originStopIds: ["O"],
    destinationStopIds: ["D"],
    travelDate: "20260830",
    departureTimeSeconds: 8 * 3600,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate
});

assert.deepEqual(
    result.firstExitStops.map(stop => stop.stopId).sort(),
    ["A-east", "A-west"]
);

const eastContext =
    result.firstContextsByStopId.get("A-east");
const westContext =
    result.firstContextsByStopId.get("A-west");

assert.equal(eastContext.length, 1);
assert.equal(eastContext[0].tripId, "r-east");
assert.equal(eastContext[0].directionId, "0");
assert.equal(eastContext[0].headsign, "Eastbound");
assert.ok(
    eastContext[0].originBoardingSequence <
    eastContext[0].firstExitSequence
);

assert.equal(westContext.length, 1);
assert.equal(westContext[0].tripId, "r-west");
assert.equal(westContext[0].directionId, "1");

assert.deepEqual(
    result.secondBoardingStops.map(stop => stop.stopId),
    ["B"]
);

const secondContexts =
    result.secondContextsByStopId.get("B");

assert.equal(secondContexts.length, 1);
assert.equal(secondContexts[0].tripId, "s-toward-destination");
assert.equal(secondContexts[0].directionId, "0");
assert.ok(
    secondContexts[0].secondBoardingSequence <
    secondContexts[0].destinationSequence
);
assert.equal(
    secondContexts.some(
        context => context.tripId === "s-away-from-destination"
    ),
    false
);

assert.equal(result.statistics.firstTripsCatchable, 2);
assert.equal(result.noActiveService, false);

const candidateResult = buildDirectionalTransferCandidates({
    originStopIds: ["O"],
    destinationStopIds: ["D"],
    travelDate: "20260830",
    departureTimeSeconds: 8 * 3600,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    maximumStraightLineMetres: 1500
});

assert.equal(candidateResult.candidates.length, 1);
assert.equal(
    candidateResult.candidates[0].firstExitStopId,
    "A-east"
);
assert.equal(
    candidateResult.candidates[0].secondBoardingStopId,
    "B"
);
assert.equal(
    candidateResult.candidates[0].firstTripOptions[0].tripId,
    "r-east"
);
assert.equal(
    candidateResult.candidates[0].secondTripOptions[0].tripId,
    "s-toward-destination"
);
assert.equal(candidateResult.statistics.spatialPairs, 1);


console.log("Directional transfer set tests passed.");
