const assert = require("node:assert/strict");
const filterTransferCandidatesWithOrs =
    require("../src/routing/ors/filterTransferCandidatesWithOrs");
const buildScheduledTransferConnections =
    require("../src/routing/transfers/buildScheduledTransferConnections");


const baseCandidate = {
    firstExitStop: { stopId: "A1" },
    secondBoardingStop: { stopId: "B1" },
    firstExitStopId: "A1",
    secondBoardingStopId: "B1",
    firstExitCoordinates: { lat: 53.51, lon: -113.51 },
    secondBoardingCoordinates: { lat: 53.511, lon: -113.511 },
    straightLineMetres: 150,
    pedestrianVerification: "pending_ors",
    firstTripOptions: [{
        routeId: "R",
        tripId: "first-1",
        firstArrivalTime: "08:10:00",
        firstArrivalTimeSeconds: 29400
    }],
    secondTripOptions: [{
        routeId: "S",
        tripId: "second-1",
        secondDepartureTime: "08:22:00",
        secondDepartureTimeSeconds: 30120,
        destinationArrivalTime: "08:40:00",
        destinationArrivalTimeSeconds: 31200
    }]
};

const candidates = [
    baseCandidate,
    {
        ...baseCandidate,
        firstExitStopId: "A2",
        secondBoardingStopId: "B2",
        firstExitCoordinates: { lat: 53.52, lon: -113.52 },
        secondBoardingCoordinates: { lat: 53.521, lon: -113.521 },
        firstTripOptions: [{
            routeId: "R2",
            tripId: "first-2",
            firstArrivalTime: "08:20:00",
            firstArrivalTimeSeconds: 30000
        }],
        secondTripOptions: [{
            routeId: "S2",
            tripId: "second-2",
            secondDepartureTime: "08:30:00",
            secondDepartureTimeSeconds: 30600,
            destinationArrivalTime: "08:45:00",
            destinationArrivalTimeSeconds: 31500
        }]
    },
    {
        ...baseCandidate,
        secondBoardingStopId: "B2",
        secondBoardingCoordinates: { lat: 53.521, lon: -113.521 }
    }
];

let captured = null;
const fetchImpl = async (url, options) => {
    captured = { url, options };

    return {
        ok: true,
        status: 200,
        async text() {
            return JSON.stringify({
                durations: [
                    [300, 900],
                    [null, 420]
                ],
                distances: [
                    [350, 1100],
                    [null, 500]
                ]
            });
        }
    };
};


async function run() {
    const filtered = await filterTransferCandidatesWithOrs({
        candidates,
        maximumWalkingSeconds: 600,
        apiKey: "ors-test-key",
        matrixUrl:
            "https://api.heigit.org/heigit/openrouteservice/v2/matrix/foot-walking",
        fetchImpl
    });

    assert.equal(
        captured.url,
        "https://api.heigit.org/heigit/openrouteservice/v2/matrix/foot-walking"
    );
    assert.equal(
        captured.options.headers.Authorization,
        "ors-test-key"
    );

    const requestBody = JSON.parse(captured.options.body);

    // ORS coordinate order must be longitude, latitude.
    assert.deepEqual(requestBody.locations[0], [-113.51, 53.51]);
    assert.deepEqual(requestBody.locations[2], [-113.511, 53.511]);
    assert.deepEqual(requestBody.sources, ["0", "1"]);
    assert.deepEqual(requestBody.destinations, ["2", "3"]);
    assert.deepEqual(requestBody.metrics, ["duration", "distance"]);

    assert.equal(filtered.checked, 3);
    assert.equal(filtered.candidates.length, 2);
    assert.equal(filtered.rejected.overWalkingLimit, 1);
    assert.equal(filtered.candidates[0].orsWalkingSeconds, 300);
    assert.equal(filtered.candidates[0].orsWalkingMetres, 350);
    assert.equal(
        filtered.candidates[0].pedestrianVerification,
        "verified_ors"
    );

    const connections = buildScheduledTransferConnections({
        candidates: filtered.candidates,
        minimumBoardingBufferSeconds: 300
    });

    // A1: 08:10 + 5 min walk + 5 min buffer -> catches 08:22.
    assert.equal(connections.length, 1);
    assert.equal(connections[0].firstTrip.tripId, "first-1");
    assert.equal(connections[0].secondTrip.tripId, "second-1");
    assert.equal(connections[0].finalArrivalTime, "08:40:00");
    assert.equal(connections[0].transfer.source, "openrouteservice");

    // A2: 08:20 + 7 min walk + 5 min buffer -> misses 08:30.
    assert.equal(
        connections.some(
            connection => connection.firstTrip.tripId === "first-2"
        ),
        false
    );

    console.log("ORS transfer filtering tests passed.");
}


run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
