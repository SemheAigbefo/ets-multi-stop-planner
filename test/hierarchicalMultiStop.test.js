const assert = require("node:assert/strict");
const planMultiStopTrip = require("../src/routing/planMultiStopTrip");


const stops = ["A", "B", "C"].map(id => ({
    stopId: id,
    name: `Stop ${id}`,
    lat: 53.5,
    lon: -113.5,
    routes: []
}));
const stopById = new Map(stops.map(stop => [stop.stopId, stop]));
const calls = [];

const hierarchicalPlanner = async options => {
    calls.push(options.departureTimeSeconds);
    const firstLeg = calls.length === 1;
    const departureTime = firstLeg ? "08:05:00" : "09:05:00";
    const arrivalTime = firstLeg ? "08:30:00" : "09:15:00";

    return {
        success: true,
        phase: "phase_2",
        finalArrivalTime: arrivalTime,
        bestConnection: null,
        phase1: { success: false },
        phase2: { centrePath: { centres: [] } },
        verifiedJourney: {
            arrivalTime,
            actions: [{
                type: "transit",
                routeId: firstLeg ? "10" : "20",
                tripId: firstLeg ? "first" : "second",
                fromStopId: firstLeg ? "A" : "B",
                toStopId: firstLeg ? "B" : "C",
                departureTime,
                arrivalTime
            }]
        }
    };
};


async function run() {
    const result = await planMultiStopTrip({
        routeStops: [
            { routingStop: routingStop(stops[0]) },
            {
                routingStop: routingStop(stops[1]),
                /* Legacy intermediate times must be ignored. */
                preferredDepartureTime: "09:00:00"
            },
            { routingStop: routingStop(stops[2]) }
        ],
        travelDate: "20260701",
        initialDepartureTime: "08:00:00",
        kdTree: null,
        stopById,
        tripsByRoute: new Map(),
        stopTimesByTrip: new Map(),
        serviceByDate: new Map([
            ["20260701", new Set(["weekday"])]
        ]),
        hierarchicalOptions: {},
        hierarchicalPlanner
    });

    assert.equal(result.success, true);
    assert.equal(result.legs.length, 2);
    assert.deepEqual(calls, [8 * 3600, 8 * 3600 + 30 * 60]);
    assert.equal(result.legs[0].arrivalTime, "08:30:00");
    assert.equal(result.legs[1].earliestAvailableTime, "08:30:00");
    assert.equal(result.legs[1].preferenceStatus, "not_requested");
    assert.equal(result.legs[1].searchedFrom, "08:30:00");
    assert.equal(result.legs[1].arrivalTime, "09:15:00");
    assert.equal(result.finalArrivalTime, "09:15:00");
    assert.equal(
        result.legs[0].routingDetails.hierarchical.phase,
        "phase_2"
    );

    const localTransfer = {
        type: "transfer",
        routingEngine: "time_dependent_graph",
        departureTime: "08:05:00",
        arrivalTime: "08:25:00",
        itinerary: [{
            type: "transit",
            routeId: "local",
            fromStopId: "A",
            toStopId: "B",
            departureTime: "08:05:00",
            arrivalTime: "08:25:00"
        }]
    };
    const localFirst = await planMultiStopTrip({
        routeStops: [
            { routingStop: routingStop(stops[0]) },
            { routingStop: routingStop(stops[1]) }
        ],
        travelDate: "20260701",
        initialDepartureTime: "08:00:00",
        kdTree: null,
        stopById,
        tripsByRoute: new Map(),
        stopTimesByTrip: new Map(),
        serviceByDate: new Map(),
        hierarchicalOptions: {},
        legPlanner: async () => ({
            bestItinerary: localTransfer,
            failureReason: null
        }),
        hierarchicalPlanner: async () => ({
            success: true,
            phase: "phase_2",
            finalArrivalTime: "09:30:00",
            phase1: { success: false },
            verifiedJourney: {
                arrivalTime: "09:30:00",
                actions: []
            }
        })
    });

    assert.equal(localFirst.success, true);
    assert.equal(
        localFirst.legs[0].itinerary.routingEngine,
        "time_dependent_graph"
    );
    assert.equal(localFirst.legs[0].arrivalTime, "08:25:00");
    assert.equal(
        localFirst.legs[0].routingDetails.hierarchicalAlternative.phase,
        "phase_2"
    );

    console.log("Hierarchical multi-stop reuse tests passed.");
}


function routingStop(stop) {
    return {
        name: stop.name,
        stopIds: [stop.stopId],
        routes: [],
        physicalStops: [stop],
        coordinates: { lat: stop.lat, lon: stop.lon },
        isExactStop: true
    };
}


run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
