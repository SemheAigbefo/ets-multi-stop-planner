const assert = require("node:assert/strict");
const {
    findTransitCentrePath
} = require("../src/routing/transitCentres/findTransitCentrePath");


function connection({
    routeId,
    tripId,
    serviceId = "weekday",
    departureTime,
    arrivalTime
}) {
    return {
        routeId,
        tripId,
        serviceId,
        departureTime,
        arrivalTime,
        boardingStopId: `${tripId}-from`,
        arrivalStopId: `${tripId}-to`
    };
}


function edge(from, to, connections) {
    return {
        fromCentreId: from,
        toCentreId: to,
        routeIds: new Set(connections.map(item => item.routeId)),
        connections
    };
}


const graph = new Map([
    ["A", new Map([
        ["B", edge("A", "B", [
            connection({ routeId: "10", tripId: "missed",
                departureTime: "08:02:00", arrivalTime: "08:10:00" }),
            connection({ routeId: "10", tripId: "catchable",
                departureTime: "08:06:00", arrivalTime: "08:15:00" })
        ])],
        ["D", edge("A", "D", [
            connection({ routeId: "40", tripId: "inactive",
                serviceId: "weekend", departureTime: "08:10:00",
                arrivalTime: "08:30:00" })
        ])]
    ])],
    ["B", new Map([
        ["C", edge("B", "C", [
            connection({ routeId: "20", tripId: "to-c",
                departureTime: "08:21:00", arrivalTime: "08:30:00" })
        ])],
        ["E", edge("B", "E", [
            connection({ routeId: "30", tripId: "to-e",
                departureTime: "08:22:00", arrivalTime: "08:28:00" })
        ])]
    ])],
    ["C", new Map()],
    ["D", new Map()],
    ["E", new Map()]
]);

const result = findTransitCentrePath({
    graph,
    startStates: [{
        centreId: "A",
        arrivalTimeSeconds: 8 * 3600,
        access: { routeId: "local" }
    }],
    destinationCentreIds: new Set(["C", "E"]),
    destinationPriorityByCentreId: new Map([
        ["C", 500],
        ["E", 100]
    ]),
    travelDate: "20260831",
    serviceByDate: new Map([
        ["20260831", new Set(["weekday"])]
    ]),
    minimumTransferSeconds: 300
});

assert.equal(result.success, true);
assert.deepEqual(result.centres, ["A", "B", "E"]);
assert.deepEqual(
    result.connections.map(item => item.tripId),
    ["catchable", "to-e"]
);
assert.equal(result.centreConnections, 2);
assert.equal(result.destinationCentreId, "E");
assert.deepEqual(result.startingAccess, { routeId: "local" });

const reverseFailure = findTransitCentrePath({
    graph,
    startStates: [{ centreId: "C", arrivalTimeSeconds: 8 * 3600 }],
    destinationCentreIds: new Set(["A"]),
    travelDate: "20260831",
    serviceByDate: new Map([
        ["20260831", new Set(["weekday"])]
    ])
});

assert.equal(reverseFailure.success, false);
assert.equal(reverseFailure.reason, "no_transit_centre_path");

const tightCenturyTransfer = findTransitCentrePath({
    graph: new Map([["century", new Map()]]),
    startStates: [{
        centreId: "century",
        arrivalTimeSeconds: 13 * 3600 + 27 * 60,
        access: { arrivalStopId: "4214" }
    }],
    destinationCentreIds: new Set(["century"]),
    destinationConnectionsByCentreId: new Map([
        ["century", [
            {
                type: "transit_centre_bus_to_destination",
                tripId: "too-tight",
                serviceId: "weekday",
                boardingStopId: "4215",
                departureTime: "13:30:00",
                arrivalTime: "13:58:00",
                destinationDistanceMetres: 100
            },
            {
                type: "transit_centre_bus_to_destination",
                tripId: "catchable",
                serviceId: "weekday",
                boardingStopId: "4215",
                departureTime: "14:02:00",
                arrivalTime: "14:28:00",
                destinationDistanceMetres: 100
            }
        ]]
    ]),
    travelDate: "20260831",
    serviceByDate: new Map([
        ["20260831", new Set(["weekday"])]
    ]),
    stopById: new Map([
        ["4214", { stopId: "4214", lat: 53.457592, lon: -113.515642 }],
        ["4215", { stopId: "4215", lat: 53.457851, lon: -113.515628 }]
    ]),
    minimumTransferSeconds: 180
});

assert.equal(tightCenturyTransfer.success, true);
assert.equal(tightCenturyTransfer.destinationEgress.tripId, "catchable");

console.log("Transit-centre BFS tests passed.");
