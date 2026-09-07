/*
 * Builds a directed multigraph from GTFS stop order.
 *
 * If one trip visits A -> B -> C, the graph records A->B, B->C and A->C.
 * A->C matters because the rider can remain on the same bus through B.
 */
function buildTransitCentreGraph({
    centresById,
    centreByStopId,
    tripsByRoute,
    stopTimesByTrip
}) {
    const graph = new Map();

    for (const centreId of centresById.keys()) {
        graph.set(centreId, new Map());
    }

    for (const [routeIdValue, trips] of tripsByRoute) {
        const routeId = String(routeIdValue);

        for (const trip of trips) {
            const stopTimes = [
                ...(stopTimesByTrip.get(trip.tripId) || [])
            ].sort(
                (first, second) =>
                    Number(first.stopSequence) - Number(second.stopSequence)
            );
            const visits = [];

            for (const stopTime of stopTimes) {
                const stopId = String(stopTime.stopId);
                const centreId = centreByStopId.get(stopId);

                if (!centreId) continue;

                const previousVisit = visits[visits.length - 1];

                /* Multiple GTFS records belonging to the same logical centre
                 * are one visit, not a self-transfer. */
                if (previousVisit?.centreId === centreId) {
                    previousVisit.exitStopId = stopId;
                    previousVisit.arrivalTime = stopTime.arrivalTime;
                    previousVisit.stopSequence = stopTime.stopSequence;
                    continue;
                }

                visits.push({
                    centreId,
                    boardingStopId: stopId,
                    exitStopId: stopId,
                    departureTime: stopTime.departureTime,
                    arrivalTime: stopTime.arrivalTime,
                    stopSequence: stopTime.stopSequence
                });
            }

            for (let fromIndex = 0; fromIndex < visits.length; fromIndex++) {
                for (
                    let toIndex = fromIndex + 1;
                    toIndex < visits.length;
                    toIndex++
                ) {
                    addConnection({
                        graph,
                        routeId,
                        trip,
                        fromVisit: visits[fromIndex],
                        toVisit: visits[toIndex]
                    });
                }
            }
        }
    }

    return graph;
}


function addConnection({ graph, routeId, trip, fromVisit, toVisit }) {
    const outgoing = graph.get(fromVisit.centreId);

    if (!outgoing.has(toVisit.centreId)) {
        outgoing.set(toVisit.centreId, {
            fromCentreId: fromVisit.centreId,
            toCentreId: toVisit.centreId,
            routeIds: new Set(),
            connections: []
        });
    }

    const edge = outgoing.get(toVisit.centreId);
    edge.routeIds.add(routeId);
    edge.connections.push({
        fromCentreId: fromVisit.centreId,
        toCentreId: toVisit.centreId,
        routeId,
        tripId: String(trip.tripId),
        serviceId: String(trip.serviceId),
        directionId: trip.directionId ?? null,
        headsign: trip.headsign || null,
        boardingStopId: fromVisit.boardingStopId,
        departureTime: fromVisit.departureTime,
        departureSequence: fromVisit.stopSequence,
        arrivalStopId: toVisit.exitStopId,
        arrivalTime: toVisit.arrivalTime,
        arrivalSequence: toVisit.stopSequence
    });
}


module.exports = buildTransitCentreGraph;
