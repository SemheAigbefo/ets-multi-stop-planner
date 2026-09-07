const {
    gtfsTimeToSeconds
} = require("../graph/gtfsTime");
const {
    distanceMetres
} = require("../../spatial/nearestStop");
const {
    isTripEligibleForSearch
} = require("../tripEligibility");


/*
 * Level-order BFS over the directed transit-centre graph.
 *
 * Queue depth, not arrival time, determines priority. Within one BFS level,
 * an earlier arrival at the same centre replaces a later equivalent state so
 * the following level has the best chance of catching another bus.
 */
function findTransitCentrePath({
    graph,
    startStates,
    destinationCentreIds,
    travelDate,
    serviceByDate,
    stopById = null,
    destinationConnectionsByCentreId = null,
    destinationPriorityByCentreId = new Map(),
    minimumTransferSeconds = 300,
    getCentreTransferBufferSeconds = null,
    maximumCentreConnections = 6,
    requestedDepartureTimeSeconds = null
}) {
    if (!(graph instanceof Map)) {
        throw new TypeError("Transit-centre graph must be a Map.");
    }

    if (!Array.isArray(startStates) || startStates.length === 0) {
        return failure("no_starting_transit_centres", 0);
    }

    const destinations = new Set(
        [...destinationCentreIds].map(String)
    );
    const activeServices = serviceByDate.get(travelDate);

    if (!activeServices) {
        return failure("no_active_service", 0);
    }

    let frontier = deduplicateStartingStates(startStates, graph);
    const visitedDepth = new Map(
        frontier.map(state => [state.centreId, 0])
    );
    let processedStates = 0;

    const startingMatch = chooseDestination(
        frontier.filter(state => destinations.has(state.centreId)),
        destinationPriorityByCentreId,
        destinationConnectionsByCentreId,
        activeServices,
        minimumTransferSeconds,
        getCentreTransferBufferSeconds,
        stopById,
        requestedDepartureTimeSeconds
    );

    if (startingMatch) {
        return success(
            startingMatch.state,
            processedStates,
            startingMatch.egress
        );
    }

    for (
        let depth = 0;
        depth < maximumCentreConnections && frontier.length > 0;
        depth++
    ) {
        const nextByCentreId = new Map();

        for (const state of frontier) {
            processedStates++;
            const outgoing = graph.get(state.centreId) || new Map();

            for (const edge of outgoing.values()) {
                const nextDepth = depth + 1;
                const previousDepth = visitedDepth.get(edge.toCentreId);

                if (
                    previousDepth !== undefined &&
                    previousDepth < nextDepth
                ) {
                    continue;
                }

                const connection = earliestCatchableConnection({
                    connections: edge.connections,
                    activeServices,
                    availableTimeSeconds: state.arrivalTimeSeconds,
                    minimumTransferSeconds: centreBuffer(
                        state.centreId,
                        minimumTransferSeconds,
                        getCentreTransferBufferSeconds
                    ),
                    currentStopId: state.currentStopId,
                    stopById,
                    requestedDepartureTimeSeconds
                });

                if (!connection) continue;

                const candidate = {
                    centreId: String(edge.toCentreId),
                    arrivalTimeSeconds:
                        gtfsTimeToSeconds(connection.arrivalTime),
                    depth: nextDepth,
                    previousState: state,
                    connection,
                    currentStopId: String(connection.arrivalStopId)
                };
                const existing = nextByCentreId.get(candidate.centreId);

                if (
                    !existing ||
                    candidate.arrivalTimeSeconds < existing.arrivalTimeSeconds
                ) {
                    nextByCentreId.set(candidate.centreId, candidate);
                    visitedDepth.set(candidate.centreId, nextDepth);
                }
            }
        }

        frontier = [...nextByCentreId.values()];

        const destinationMatch = chooseDestination(
            frontier.filter(state => destinations.has(state.centreId)),
            destinationPriorityByCentreId,
            destinationConnectionsByCentreId,
            activeServices,
            minimumTransferSeconds,
            getCentreTransferBufferSeconds,
            stopById,
            requestedDepartureTimeSeconds
        );

        if (destinationMatch) {
            return success(
                destinationMatch.state,
                processedStates,
                destinationMatch.egress
            );
        }
    }

    return failure("no_transit_centre_path", processedStates);
}


function deduplicateStartingStates(startStates, graph) {
    const byCentreId = new Map();

    for (const start of startStates) {
        const centreId = String(start.centreId);
        const arrivalTimeSeconds = Number(start.arrivalTimeSeconds);

        if (!graph.has(centreId) || !Number.isFinite(arrivalTimeSeconds)) {
            continue;
        }

        const existing = byCentreId.get(centreId);

        if (!existing || arrivalTimeSeconds < existing.arrivalTimeSeconds) {
            byCentreId.set(centreId, {
                centreId,
                arrivalTimeSeconds,
                depth: 0,
                previousState: null,
                connection: null,
                currentStopId:
                    start.access?.arrivalStopId ||
                    start.access?.originStopId ||
                    null,
                access: start.access || null
            });
        }
    }

    return [...byCentreId.values()];
}


function earliestCatchableConnection({
    connections,
    activeServices,
    availableTimeSeconds,
    minimumTransferSeconds,
    currentStopId = null,
    stopById = null,
    requestedDepartureTimeSeconds = null
}) {
    let best = null;
    let bestArrival = Infinity;

    for (const connection of connections) {
        if (!activeServices.has(connection.serviceId)) continue;
        if (
            !isTripEligibleForSearch(
                connection,
                requestedDepartureTimeSeconds
            )
        ) continue;

        const departure = gtfsTimeToSeconds(connection.departureTime);
        const arrival = gtfsTimeToSeconds(connection.arrivalTime);

        const walkingSeconds = estimateBayWalkSeconds(
            currentStopId,
            connection.boardingStopId,
            stopById
        );

        if (
            departure <
                availableTimeSeconds +
                walkingSeconds +
                minimumTransferSeconds
        ) {
            continue;
        }

        if (arrival < bestArrival) {
            best = connection;
            bestArrival = arrival;
        }
    }

    return best;
}


function chooseDestination(
    states,
    priorities,
    destinationConnectionsByCentreId,
    activeServices,
    minimumTransferSeconds,
    getCentreTransferBufferSeconds = null,
    stopById = null,
    requestedDepartureTimeSeconds = null
) {
    if (states.length === 0) return null;

    const matches = [];

    for (const state of states) {
        const egress = destinationConnectionsByCentreId
            ? earliestCatchableEgress({
                connections:
                    destinationConnectionsByCentreId.get(state.centreId) || [],
                activeServices,
                availableTimeSeconds: state.arrivalTimeSeconds,
                minimumTransferSeconds: centreBuffer(
                    state.centreId,
                    minimumTransferSeconds,
                    getCentreTransferBufferSeconds
                ),
                currentStopId: state.currentStopId,
                stopById,
                requestedDepartureTimeSeconds
            })
            : null;

        if (destinationConnectionsByCentreId && !egress) continue;

        matches.push({ state, egress });
    }

    return matches.sort((firstMatch, secondMatch) => {
        const first = firstMatch.state;
        const second = secondMatch.state;
        const firstPriority =
            firstMatch.egress?.destinationDistanceMetres ??
            priorities.get(first.centreId) ?? Infinity;
        const secondPriority =
            secondMatch.egress?.destinationDistanceMetres ??
            priorities.get(second.centreId) ?? Infinity;

        return firstPriority - secondPriority ||
            first.arrivalTimeSeconds - second.arrivalTimeSeconds;
    })[0];
}


function centreBuffer(centreId, fallback, resolver) {
    return typeof resolver === "function"
        ? resolver(centreId)
        : fallback;
}


function earliestCatchableEgress({
    connections,
    activeServices,
    availableTimeSeconds,
    minimumTransferSeconds,
    currentStopId = null,
    stopById = null,
    requestedDepartureTimeSeconds = null
}) {
    let best = null;

    for (const connection of connections) {
        if (connection.type === "already_at_destination_centre") {
            return connection;
        }

        if (!activeServices.has(connection.serviceId)) continue;
        if (
            !isTripEligibleForSearch(
                connection,
                requestedDepartureTimeSeconds
            )
        ) continue;

        const departure = gtfsTimeToSeconds(connection.departureTime);

        const walkingSeconds = estimateBayWalkSeconds(
            currentStopId,
            connection.boardingStopId,
            stopById
        );

        if (
            departure <
                availableTimeSeconds +
                walkingSeconds +
                minimumTransferSeconds
        ) {
            continue;
        }

        if (
            !best ||
            connection.destinationDistanceMetres <
                best.destinationDistanceMetres ||
            (
                connection.destinationDistanceMetres ===
                    best.destinationDistanceMetres &&
                gtfsTimeToSeconds(connection.arrivalTime) <
                    gtfsTimeToSeconds(best.arrivalTime)
            )
        ) {
            best = connection;
        }
    }

    return best;
}


function estimateBayWalkSeconds(fromStopId, toStopId, stopById) {
    if (
        !fromStopId ||
        !toStopId ||
        !stopById ||
        String(fromStopId) === String(toStopId)
    ) {
        return 0;
    }

    const fromStop = stopById.get(String(fromStopId));
    const toStop = stopById.get(String(toStopId));

    if (!fromStop || !toStop) return 0;

    const straightLineMetres = distanceMetres(
        Number(fromStop.lat),
        Number(fromStop.lon),
        Number(toStop.lat),
        Number(toStop.lon)
    );

    /* Conservative local estimate; ORS and Google still verify the finalist. */
    return Math.ceil(straightLineMetres * 1.2 / 1.4);
}


function reconstruct(state) {
    const centres = [];
    const connections = [];
    let current = state;

    while (current) {
        centres.push(current.centreId);

        if (current.connection) {
            connections.push(current.connection);
        }

        current = current.previousState;
    }

    centres.reverse();
    connections.reverse();

    return { centres, connections };
}


function success(state, processedStates, destinationEgress = null) {
    const path = reconstruct(state);

    return {
        success: true,
        reason: null,
        destinationCentreId: state.centreId,
        centreConnections: path.connections.length,
        arrivalTimeSeconds:
            destinationEgress?.arrivalTime
                ? gtfsTimeToSeconds(destinationEgress.arrivalTime)
                : state.arrivalTimeSeconds,
        centres: path.centres,
        connections: path.connections,
        startingAccess: findStartingState(state).access,
        destinationEgress,
        statistics: { processedStates }
    };
}


function findStartingState(state) {
    let current = state;

    while (current.previousState) {
        current = current.previousState;
    }

    return current;
}


function failure(reason, processedStates) {
    return {
        success: false,
        reason,
        destinationCentreId: null,
        centreConnections: 0,
        centres: [],
        connections: [],
        startingAccess: null,
        statistics: { processedStates }
    };
}


module.exports = {
    findTransitCentrePath,
    earliestCatchableConnection
};
