const assert = require("node:assert/strict");
const verifyTransitCentreJourney =
    require("../src/routing/transitCentres/verifyTransitCentreJourney");


const stopById = new Map([
    ["O", { stopId: "O", lat: 53.50, lon: -113.50 }],
    ["A1", { stopId: "A1", lat: 53.51, lon: -113.50 }],
    ["A2", { stopId: "A2", lat: 53.5102, lon: -113.5002 }],
    ["B1", { stopId: "B1", lat: 53.52, lon: -113.50 }],
    ["B2", { stopId: "B2", lat: 53.5202, lon: -113.5002 }],
    ["D", { stopId: "D", lat: 53.53, lon: -113.50 }]
]);

const journey = {
    success: true,
    startingAccess: {
        type: "origin_bus_to_transit_centre",
        routeId: "1",
        tripId: "access",
        boardingStopId: "O",
        departureTime: "08:05:00",
        arrivalStopId: "A1",
        arrivalTime: "08:15:00"
    },
    connections: [{
        routeId: "2",
        tripId: "middle",
        boardingStopId: "A2",
        departureTime: "08:21:00",
        arrivalStopId: "B1",
        arrivalTime: "08:30:00"
    }],
    destinationEgress: {
        type: "transit_centre_bus_to_destination",
        routeId: "3",
        tripId: "egress",
        boardingStopId: "B2",
        departureTime: "08:36:00",
        destinationStopId: "D",
        arrivalTime: "08:46:00"
    }
};

let orsCalls = 0;
let googleCalls = 0;

const fetchImpl = async url => {
    if (String(url).includes("openrouteservice")) {
        orsCalls++;

        return {
            ok: true,
            status: 200,
            async text() {
                return JSON.stringify({
                    durations: Array.from({ length: 4 }, () =>
                        Array(4).fill(60)),
                    distances: Array.from({ length: 4 }, () =>
                        Array(4).fill(100))
                });
            }
        };
    }

    googleCalls++;

    return {
        ok: true,
        status: 200,
        async json() {
            return {
                routes: [{
                    duration: "60s",
                    distanceMeters: 100,
                    polyline: { encodedPolyline: "walk" }
                }]
            };
        }
    };
};


async function run() {
    const verified = await verifyTransitCentreJourney({
        journey,
        requestedDepartureTimeSeconds: 8 * 3600,
        originLocation: { lat: 53.499, lon: -113.50 },
        destinationLocation: { lat: 53.531, lon: -113.50 },
        stopById,
        orsApiKey: "ors-test-key",
        orsMatrixUrl:
            "https://api.openrouteservice.org/v2/matrix/foot-walking",
        googleRoutesApiKey: "google-test-key",
        fetchImpl
    });

    assert.equal(verified.success, true);
    assert.equal(orsCalls, 1);
    assert.equal(googleCalls, 4);
    assert.equal(verified.walkingSegments.length, 4);
    assert.deepEqual(
        verified.actions.map(action => action.type),
        ["walk", "transit", "walk", "transit", "walk", "transit", "walk"]
    );
    assert.equal(verified.arrivalTime, "08:47:00");
    assert.deepEqual(verified.actions[0].fromLocation, {
        lat: 53.499,
        lon: -113.50
    });
    assert.equal(verified.actions[0].fromStopId, null);
    assert.deepEqual(verified.actions.at(-1).toLocation, {
        lat: 53.531,
        lon: -113.50
    });

    console.log("Transit-centre walking verification tests passed.");
}


run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
