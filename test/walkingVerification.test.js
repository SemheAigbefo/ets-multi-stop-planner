const assert = require("node:assert/strict");

const {
    verifyWalkingItinerary,
    WalkingVerificationError,
    parseGoogleDuration
} = require("../src/routing/graph");


assert.equal(parseGoogleDuration("61.2s"), 62);

const stopById = new Map([
    ["B", { stopId: "B", lat: 53.5100, lon: -113.5000 }],
    ["X", { stopId: "X", lat: 53.5104, lon: -113.5000 }]
]);

const journey = {
    success: true,
    departureTime: "08:00:00",
    departureTimeSeconds: 28800,
    arrivalTime: "08:30:00",
    arrivalTimeSeconds: 30600,
    durationSeconds: 1800,
    walkingSeconds: 40,
    walkingMetres: 55,
    itinerary: [
        {
            type: "transit",
            tripId: "trip-r",
            fromStopId: "A",
            toStopId: "B",
            departureTimeSeconds: 29100,
            arrivalTimeSeconds: 29400
        },
        {
            type: "walk",
            fromStopId: "B",
            toStopId: "X",
            distanceMetres: 55,
            durationSeconds: 40,
            estimated: true
        },
        {
            type: "transit",
            tripId: "trip-s",
            fromStopId: "X",
            toStopId: "D",
            departureTimeSeconds: 29820,
            arrivalTimeSeconds: 30600
        }
    ]
};

let capturedRequest = null;
const successfulFetch = async (url, options) => {
    capturedRequest = { url, options };

    return {
        ok: true,
        status: 200,
        async json() {
            return {
                routes: [{
                    duration: "60s",
                    distanceMeters: 80,
                    polyline: {
                        encodedPolyline: "encoded-walk"
                    }
                }]
            };
        }
    };
};

async function run() {
    const verified = await verifyWalkingItinerary({
        journey,
        stopById,
        apiKey: "test-key",
        fetchImpl: successfulFetch,
        minimumTransferSeconds: 300
    });

    assert.equal(capturedRequest.options.method, "POST");
    assert.equal(capturedRequest.options.headers["X-Goog-Api-Key"], "test-key");
    assert.equal(
        JSON.parse(capturedRequest.options.body).travelMode,
        "WALK"
    );
    assert.equal(verified.success, true);
    assert.equal(verified.walkingSeconds, 60);
    assert.equal(verified.walkingMetres, 80);
    assert.equal(verified.itinerary[1].estimated, false);
    assert.equal(
        verified.itinerary[1].encodedPolyline,
        "encoded-walk"
    );
    assert.equal(verified.walkingVerification.segmentsVerified, 1);
    assert.equal(verified.arrivalTime, "08:30:00");

    let fetchCalls = 0;
    const transitOnly = await verifyWalkingItinerary({
        journey: {
            ...journey,
            itinerary: [journey.itinerary[0]],
            arrivalTimeSeconds: 29400
        },
        stopById,
        apiKey: "test-key",
        fetchImpl: async () => {
            fetchCalls++;
        }
    });

    assert.equal(fetchCalls, 0);
    assert.equal(transitOnly.walkingVerification.segmentsVerified, 0);

    const slowWalkingFetch = async () => ({
        ok: true,
        status: 200,
        async json() {
            return {
                routes: [{
                    duration: "180s",
                    distanceMeters: 210,
                    polyline: { encodedPolyline: "slow-walk" }
                }]
            };
        }
    });

    await assert.rejects(
        () => verifyWalkingItinerary({
            journey,
            stopById,
            apiKey: "test-key",
            fetchImpl: slowWalkingFetch,
            minimumTransferSeconds: 300
        }),
        error =>
            error instanceof WalkingVerificationError &&
            error.code === "WALKING_CONNECTION_INFEASIBLE"
    );

    const longWalkingFetch = async () => ({
        ok: true,
        status: 200,
        async json() {
            return {
                routes: [{
                    duration: "500s",
                    distanceMeters: 1100
                }]
            };
        }
    });

    await assert.rejects(
        () => verifyWalkingItinerary({
            journey,
            stopById,
            apiKey: "test-key",
            fetchImpl: longWalkingFetch
        }),
        error =>
            error instanceof WalkingVerificationError &&
            error.code === "WALKING_DISTANCE_EXCEEDED"
    );

    const failedFetch = async () => ({
        ok: false,
        status: 400,
        async json() {
            return {
                error: { message: "No pedestrian route" }
            };
        }
    });

    await assert.rejects(
        () => verifyWalkingItinerary({
            journey,
            stopById,
            apiKey: "test-key",
            fetchImpl: failedFetch
        }),
        error =>
            error instanceof WalkingVerificationError &&
            /No pedestrian route/.test(error.message)
    );

    console.log("Phase 6 walking verification tests passed.");
}


run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
