const {
    gtfsTimeToSeconds
} = require("../graph/gtfsTime");
const {
    isTripEligibleForSearch
} = require("../tripEligibility");


function addContext(contextsByStopId, stopId, context) {
    const normalizedStopId = String(stopId);

    if (!contextsByStopId.has(normalizedStopId)) {
        contextsByStopId.set(normalizedStopId, []);
    }

    contextsByStopId.get(normalizedStopId).push(context);
}


function uniquePhysicalStops(stopIds, stopById) {
    const stops = [];

    for (const stopId of stopIds) {
        const stop = stopById.get(String(stopId));

        if (stop) {
            stops.push(stop);
        }
    }

    return stops;
}


/*
 * Builds the two physical-stop sets used by the transfer walking search.
 *
 * Set A: stops downstream of a catchable first-trip boarding.
 * Set B: stops appearing before a destination-area stop on a second trip.
 *
 * Stop order is the decisive direction test. directionId and headsign are
 * retained as metadata, but neither one is trusted as proof of reachability.
 */
function buildDirectionalTransferSets({
    originStopIds,
    destinationStopIds,
    travelDate,
    departureTimeSeconds,
    earliestBoardingByStopId = null,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    maximumInitialWaitSeconds = 7200,
    allowedRouteTypes = null
}) {
    const activeServices = serviceByDate.get(travelDate);
    const firstContextsByStopId = new Map();
    const secondContextsByStopId = new Map();
    const firstStopIds = new Set();
    const secondStopIds = new Set();
    const firstContextKeys = new Set();
    const secondContextKeys = new Set();
    const statistics = {
        firstTripsChecked: 0,
        firstTripsCatchable: 0,
        firstDirectionalContexts: 0,
        secondTripsChecked: 0,
        secondDirectionalContexts: 0
    };

    if (!activeServices) {
        return result(
            firstStopIds,
            secondStopIds,
            firstContextsByStopId,
            secondContextsByStopId,
            stopById,
            statistics,
            true
        );
    }

    const numericDepartureTime = Number(departureTimeSeconds);

    if (!Number.isFinite(numericDepartureTime)) {
        throw new TypeError("departureTimeSeconds must be a number.");
    }

    /* Build set A separately for every origin physical stop and trip. */
    for (const originStopIdValue of new Set(originStopIds.map(String))) {
        const originStop = stopById.get(originStopIdValue);

        if (!originStop) continue;

        const earliestBoarding = earliestBoardingByStopId?.get(
            originStopIdValue
        ) ?? numericDepartureTime;

        for (const route of originStop.routes || []) {
            const routeId = String(route.routeId);
            const trips = tripsByRoute.get(routeId) || [];

            for (const trip of trips) {
                statistics.firstTripsChecked++;

                if (!activeServices.has(trip.serviceId)) continue;
                if (allowedRouteTypes &&
                    !allowedRouteTypes.includes(String(trip.routeType))) continue;
                if (!isTripEligibleForSearch(trip, numericDepartureTime)) {
                    continue;
                }

                const stopTimes = stopTimesByTrip.get(trip.tripId) || [];

                for (
                    let boardingIndex = 0;
                    boardingIndex < stopTimes.length;
                    boardingIndex++
                ) {
                    const boarding = stopTimes[boardingIndex];

                    if (String(boarding.stopId) !== originStopIdValue) {
                        continue;
                    }

                    const departureSeconds = gtfsTimeToSeconds(
                        boarding.departureTime
                    );

                    if (
                        departureSeconds < earliestBoarding ||
                        departureSeconds - earliestBoarding >
                            maximumInitialWaitSeconds
                    ) {
                        continue;
                    }

                    statistics.firstTripsCatchable++;

                    for (
                        let exitIndex = boardingIndex + 1;
                        exitIndex < stopTimes.length;
                        exitIndex++
                    ) {
                        const exit = stopTimes[exitIndex];
                        const exitStopId = String(exit.stopId);

                        if (!stopById.has(exitStopId)) continue;

                        const contextKey = [
                            trip.tripId,
                            boardingIndex,
                            exitIndex
                        ].join("|");

                        if (firstContextKeys.has(contextKey)) continue;
                        firstContextKeys.add(contextKey);

                        const context = {
                            routeId,
                            tripId: String(trip.tripId),
                            serviceId: String(trip.serviceId),
                            directionId: trip.directionId ?? null,
                            headsign: trip.headsign || null,
                            routeType: trip.routeType ?? null,
                            originBoardingStopId: originStopIdValue,
                            originBoardingSequence:
                                boarding.stopSequence,
                            originDepartureTime:
                                boarding.departureTime,
                            originDepartureTimeSeconds:
                                departureSeconds,
                            firstExitStopId: exitStopId,
                            firstExitSequence: exit.stopSequence,
                            firstArrivalTime: exit.arrivalTime,
                            firstArrivalTimeSeconds:
                                gtfsTimeToSeconds(exit.arrivalTime)
                        };

                        firstStopIds.add(exitStopId);
                        addContext(
                            firstContextsByStopId,
                            exitStopId,
                            context
                        );
                        statistics.firstDirectionalContexts++;
                    }
                }
            }
        }
    }

    /* Routes are gathered from every physical destination-side stop. */
    const destinationIds = new Set(destinationStopIds.map(String));
    const destinationRouteIds = new Set();

    for (const destinationStopId of destinationIds) {
        const stop = stopById.get(destinationStopId);

        for (const route of stop?.routes || []) {
            destinationRouteIds.add(String(route.routeId));
        }
    }

    /* Build set B only from stops occurring before a destination stop. */
    for (const routeId of destinationRouteIds) {
        const trips = tripsByRoute.get(routeId) || [];

        for (const trip of trips) {
            statistics.secondTripsChecked++;

            if (!activeServices.has(trip.serviceId)) continue;
            if (allowedRouteTypes &&
                !allowedRouteTypes.includes(String(trip.routeType))) continue;
            if (!isTripEligibleForSearch(trip, numericDepartureTime)) {
                continue;
            }

            const stopTimes = stopTimesByTrip.get(trip.tripId) || [];

            for (
                let destinationIndex = 0;
                destinationIndex < stopTimes.length;
                destinationIndex++
            ) {
                const destination = stopTimes[destinationIndex];

                if (!destinationIds.has(String(destination.stopId))) {
                    continue;
                }

                for (
                    let boardingIndex = 0;
                    boardingIndex < destinationIndex;
                    boardingIndex++
                ) {
                    const boarding = stopTimes[boardingIndex];
                    const boardingStopId = String(boarding.stopId);

                    if (!stopById.has(boardingStopId)) continue;

                    const contextKey = [
                        trip.tripId,
                        boardingIndex,
                        destinationIndex
                    ].join("|");

                    if (secondContextKeys.has(contextKey)) continue;
                    secondContextKeys.add(contextKey);

                    const context = {
                        routeId,
                        tripId: String(trip.tripId),
                        serviceId: String(trip.serviceId),
                        directionId: trip.directionId ?? null,
                        headsign: trip.headsign || null,
                        routeType: trip.routeType ?? null,
                        secondBoardingStopId: boardingStopId,
                        secondBoardingSequence:
                            boarding.stopSequence,
                        secondDepartureTime:
                            boarding.departureTime,
                        secondDepartureTimeSeconds:
                            gtfsTimeToSeconds(boarding.departureTime),
                        destinationStopId:
                            String(destination.stopId),
                        destinationSequence:
                            destination.stopSequence,
                        destinationArrivalTime:
                            destination.arrivalTime,
                        destinationArrivalTimeSeconds:
                            gtfsTimeToSeconds(destination.arrivalTime)
                    };

                    secondStopIds.add(boardingStopId);
                    addContext(
                        secondContextsByStopId,
                        boardingStopId,
                        context
                    );
                    statistics.secondDirectionalContexts++;
                }
            }
        }
    }

    return result(
        firstStopIds,
        secondStopIds,
        firstContextsByStopId,
        secondContextsByStopId,
        stopById,
        statistics,
        false
    );
}


function result(
    firstStopIds,
    secondStopIds,
    firstContextsByStopId,
    secondContextsByStopId,
    stopById,
    statistics,
    noActiveService
) {
    return {
        firstExitStops: uniquePhysicalStops(firstStopIds, stopById),
        secondBoardingStops:
            uniquePhysicalStops(secondStopIds, stopById),
        firstContextsByStopId,
        secondContextsByStopId,
        statistics,
        noActiveService
    };
}


module.exports = buildDirectionalTransferSets;
