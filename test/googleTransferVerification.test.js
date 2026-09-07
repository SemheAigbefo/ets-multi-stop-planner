const assert = require("node:assert/strict");
const verifyTransferConnections =
    require("../src/routing/google/verifyTransferConnections");
const {
    rankVerifiedConnections
} = require("../src/routing/google/verifyTransferConnections");


const stopById = new Map([
    ["A", { stopId: "A", lat: 53.5, lon: -113.5 }],
    ["B", { stopId: "B", lat: 53.501, lon: -113.501 }]
]);

function connection(secondDepartureTimeSeconds) {
    return {
        firstTrip: {
            routeId: "1",
            tripId: "first",
            firstArrivalTimeSeconds: 8 * 3600,
            firstArrivalTime: "08:00:00"
        },
        transfer: {
            fromStopId: "A",
            toStopId: "B",
            walkingSeconds: 60,
            walkingMetres: 80,
            source: "openrouteservice"
        },
        secondTrip: {
            routeId: "2",
            tripId: "second",
            secondDepartureTimeSeconds,
            secondDepartureTime: "08:10:00",
            destinationArrivalTimeSeconds: 8 * 3600 + 1800,
            destinationArrivalTime: "08:30:00"
        },
        finalArrivalTimeSeconds: 8 * 3600 + 1800,
        finalArrivalTime: "08:30:00",
        googleVerification: "pending"
    };
}

async function run() {
    let calls = 0;
    const fetchImpl = async () => {
        calls++;
        return {
            ok: true,
            status: 200,
            async json() {
                return {
                    routes: [{
                        duration: "240s",
                        distanceMeters: 300,
                        polyline: { encodedPolyline: "google-walk" }
                    }]
                };
            }
        };
    };

    const verified = await verifyTransferConnections({
        connections: [
            connection(8 * 3600 + 8 * 60),
            connection(8 * 3600 + 10 * 60)
        ],
        stopById,
        apiKey: "test-key",
        fetchImpl
    });

    // 4-minute walk + 5-minute buffer misses 08:08 but catches 08:10.
    /* Both schedules use the same physical walk, so Google is called once
     * and the later catchable schedule is selected from that pair's group. */
    assert.equal(calls, 1);
    assert.equal(verified.length, 1);
    assert.equal(verified[0].googleVerification, "verified");
    assert.equal(verified[0].transfer.walkingSeconds, 240);
    assert.equal(verified[0].transfer.walkingMetres, 300);
    assert.equal(verified[0].transfer.encodedPolyline, "google-walk");
    assert.equal(verified[0].transferWaitSeconds, 360);

    const ranked = rankVerifiedConnections([
        {
            destinationWalkingMetres: 97,
            arrivalAtDestinationSeconds: 13 * 3600 + 28 * 60,
            transfer: { walkingSeconds: 373 }
        },
        {
            destinationWalkingMetres: 124,
            arrivalAtDestinationSeconds: 12 * 3600 + 48 * 60,
            transfer: { walkingSeconds: 257 }
        }
    ]);

    assert.equal(ranked[0].destinationWalkingMetres, 124);
    assert.equal(ranked[0].arrivalAtDestinationSeconds, 12 * 3600 + 48 * 60);

    const equalArrivalRanked = rankVerifiedConnections([
        {
            destinationWalkingMetres: 180,
            arrivalAtDestinationSeconds: 13 * 3600,
            transfer: { walkingSeconds: 60 }
        },
        {
            destinationWalkingMetres: 120,
            arrivalAtDestinationSeconds: 13 * 3600,
            transfer: { walkingSeconds: 240 }
        }
    ]);

    assert.equal(equalArrivalRanked[0].destinationWalkingMetres, 120);

    console.log("Google transfer-finalist verification tests passed.");
}


run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
