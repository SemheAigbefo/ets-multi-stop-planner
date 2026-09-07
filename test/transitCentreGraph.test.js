const assert = require("node:assert/strict");
const {
    identifyTransitCentres,
    canonicalTransitCentreName
} = require("../src/routing/transitCentres/identifyTransitCentres");
const buildTransitCentreGraph =
    require("../src/routing/transitCentres/buildTransitCentreGraph");


assert.equal(
    canonicalTransitCentreName("West Clareview Transit Centre"),
    "Clareview Transit Centre"
);
assert.equal(
    canonicalTransitCentreName("100A Avenue at Jasper Place Transit Centre"),
    "Jasper Place Transit Centre"
);
assert.equal(
    canonicalTransitCentreName("Southgate Transit Centre Elevator"),
    null
);

const stopById = new Map([
    ["A1", { stopId: "A1", name: "Alpha Transit Centre" }],
    ["A2", { stopId: "A2", name: "Alpha Transit Centre" }],
    ["B", { stopId: "B", name: "Beta Transit Centre" }],
    ["C", { stopId: "C", name: "Gamma Transit Centre" }],
    ["X", { stopId: "X", name: "Ordinary Stop" }]
]);

const identified = identifyTransitCentres(stopById);
assert.equal(identified.centresById.size, 3);
assert.deepEqual(
    identified.centresById.get("alpha-transit-centre").stopIds,
    ["A1", "A2"]
);

const graph = buildTransitCentreGraph({
    ...identified,
    tripsByRoute: new Map([
        ["10", [{
            tripId: "outbound",
            serviceId: "weekday",
            directionId: "0",
            headsign: "Gamma"
        }]]
    ]),
    stopTimesByTrip: new Map([
        ["outbound", [
            { stopId: "A1", stopSequence: "1",
                departureTime: "08:00:00", arrivalTime: "08:00:00" },
            { stopId: "A2", stopSequence: "2",
                departureTime: "08:01:00", arrivalTime: "08:01:00" },
            { stopId: "X", stopSequence: "3",
                departureTime: "08:05:00", arrivalTime: "08:05:00" },
            { stopId: "B", stopSequence: "4",
                departureTime: "08:10:00", arrivalTime: "08:10:00" },
            { stopId: "C", stopSequence: "5",
                departureTime: "08:20:00", arrivalTime: "08:20:00" }
        ]]
    ])
});

const alpha = graph.get("alpha-transit-centre");
assert.equal(alpha.has("beta-transit-centre"), true);
assert.equal(alpha.has("gamma-transit-centre"), true);
assert.equal(graph.get("gamma-transit-centre").has("alpha-transit-centre"), false);
assert.deepEqual(
    [...alpha.get("gamma-transit-centre").routeIds],
    ["10"]
);
assert.equal(
    alpha.get("gamma-transit-centre").connections[0].boardingStopId,
    "A1"
);
assert.equal(
    alpha.get("gamma-transit-centre").connections[0].arrivalStopId,
    "C"
);

console.log("Transit-centre graph tests passed.");
