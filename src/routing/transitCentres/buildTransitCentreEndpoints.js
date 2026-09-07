const {
    gtfsTimeToSeconds
} = require("../graph/gtfsTime");
const {
    isTripEligibleForSearch
} = require("../tripEligibility");


/*
 * Connects ordinary endpoint stops to the smaller transit-centre graph.
 * Origin trips are followed forward; destination trips are inspected backward.
 */
function buildTransitCentreEndpoints({
    originStopIds,
    destinationStopIds,
    departureTimeSeconds,
    travelDate,
    stopById,
    centreByStopId,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    destinationDistanceByStopId = new Map(),
    maximumInitialWaitSeconds = 7200
}) {
    const activeServices = serviceByDate.get(travelDate);
    const startByCentreId = new Map();
    const destinationConnectionsByCentreId = new Map();

    if (!activeServices) {
        return result(startByCentreId, destinationConnectionsByCentreId, true);
    }

    for (const originStopIdValue of new Set(originStopIds.map(String))) {
        const originCentreId = centreByStopId.get(originStopIdValue);

        if (originCentreId) {
            keepEarlierStart(startByCentreId, {
                centreId: originCentreId,
                arrivalTimeSeconds: departureTimeSeconds,
                access: {
                    type: "already_at_transit_centre",
                    originStopId: originStopIdValue
                }
            });
        }

        const originStop = stopById.get(originStopIdValue);

        for (const route of originStop?.routes || []) {
            for (const trip of tripsByRoute.get(String(route.routeId)) || []) {
                if (!activeServices.has(trip.serviceId)) continue;
                if (!isTripEligibleForSearch(trip, departureTimeSeconds)) {
                    continue;
                }

                const stopTimes = stopTimesByTrip.get(trip.tripId) || [];

                for (let index = 0; index < stopTimes.length; index++) {
                    const boarding = stopTimes[index];

                    if (String(boarding.stopId) !== originStopIdValue) continue;

                    const busDeparture = gtfsTimeToSeconds(
                        boarding.departureTime
                    );

                    if (
                        busDeparture < departureTimeSeconds ||
                        busDeparture - departureTimeSeconds >
                            maximumInitialWaitSeconds
                    ) continue;

                    const centreVisit = firstDownstreamCentre(
                        stopTimes,
                        index + 1,
                        centreByStopId
                    );

                    if (!centreVisit) continue;

                    keepEarlierStart(startByCentreId, {
                        centreId: centreVisit.centreId,
                        arrivalTimeSeconds:
                            gtfsTimeToSeconds(centreVisit.stopTime.arrivalTime),
                        access: {
                            type: "origin_bus_to_transit_centre",
                            routeId: String(route.routeId),
                            tripId: String(trip.tripId),
                            serviceId: String(trip.serviceId),
                            directionId: trip.directionId ?? null,
                            headsign: trip.headsign || null,
                            boardingStopId: originStopIdValue,
                            departureTime: boarding.departureTime,
                            arrivalCentreId: centreVisit.centreId,
                            arrivalStopId: String(centreVisit.stopTime.stopId),
                            arrivalTime: centreVisit.stopTime.arrivalTime
                        }
                    });
                }
            }
        }
    }

    for (const destinationStopIdValue of new Set(
        destinationStopIds.map(String)
    )) {
        const destinationCentreId = centreByStopId.get(
            destinationStopIdValue
        );

        if (destinationCentreId) {
            addDestinationConnection(destinationConnectionsByCentreId, {
                centreId: destinationCentreId,
                type: "already_at_destination_centre",
                destinationStopId: destinationStopIdValue,
                destinationDistanceMetres:
                    destinationDistanceByStopId.get(destinationStopIdValue) ?? 0
            });
        }

        const destinationStop = stopById.get(destinationStopIdValue);

        for (const route of destinationStop?.routes || []) {
            for (const trip of tripsByRoute.get(String(route.routeId)) || []) {
                if (!activeServices.has(trip.serviceId)) continue;
                if (!isTripEligibleForSearch(trip, departureTimeSeconds)) {
                    continue;
                }

                const stopTimes = stopTimesByTrip.get(trip.tripId) || [];

                for (
                    let destinationIndex = 0;
                    destinationIndex < stopTimes.length;
                    destinationIndex++
                ) {
                    const destination = stopTimes[destinationIndex];

                    if (
                        String(destination.stopId) !== destinationStopIdValue
                    ) continue;

                    const seenCentres = new Set();

                    for (
                        let boardingIndex = destinationIndex - 1;
                        boardingIndex >= 0;
                        boardingIndex--
                    ) {
                        const boarding = stopTimes[boardingIndex];
                        const centreId = centreByStopId.get(
                            String(boarding.stopId)
                        );

                        if (!centreId || seenCentres.has(centreId)) continue;
                        seenCentres.add(centreId);

                        addDestinationConnection(
                            destinationConnectionsByCentreId,
                            {
                                centreId,
                                type: "transit_centre_bus_to_destination",
                                routeId: String(route.routeId),
                                tripId: String(trip.tripId),
                                serviceId: String(trip.serviceId),
                                directionId: trip.directionId ?? null,
                                headsign: trip.headsign || null,
                                boardingStopId: String(boarding.stopId),
                                departureTime: boarding.departureTime,
                                destinationStopId: destinationStopIdValue,
                                arrivalTime: destination.arrivalTime,
                                destinationDistanceMetres:
                                    destinationDistanceByStopId.get(
                                        destinationStopIdValue
                                    ) ?? 0
                            }
                        );
                    }
                }
            }
        }
    }

    return result(startByCentreId, destinationConnectionsByCentreId, false);
}


function firstDownstreamCentre(stopTimes, startIndex, centreByStopId) {
    for (let index = startIndex; index < stopTimes.length; index++) {
        const stopTime = stopTimes[index];
        const centreId = centreByStopId.get(String(stopTime.stopId));

        if (centreId) return { centreId, stopTime };
    }

    return null;
}


function keepEarlierStart(startByCentreId, state) {
    const current = startByCentreId.get(state.centreId);

    if (!current || state.arrivalTimeSeconds < current.arrivalTimeSeconds) {
        startByCentreId.set(state.centreId, state);
    }
}


function addDestinationConnection(byCentreId, connection) {
    if (!byCentreId.has(connection.centreId)) {
        byCentreId.set(connection.centreId, []);
    }

    byCentreId.get(connection.centreId).push(connection);
}


function result(startByCentreId, destinationConnectionsByCentreId, noService) {
    return {
        startStates: [...startByCentreId.values()],
        destinationCentreIds:
            new Set(destinationConnectionsByCentreId.keys()),
        destinationConnectionsByCentreId,
        noActiveService: noService
    };
}


module.exports = buildTransitCentreEndpoints;
