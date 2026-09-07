const createSearchState = require("./createSearchState");
const {
    gtfsTimeToSeconds
} = require("./gtfsTime");
const {
    isTripEligibleForSearch
} = require("../tripEligibility");


/* Returns every position where a physical stop occurs in a trip pattern. */
function findBoardingIndexes(stopTimes, stopId) {
    const normalizedStopId = String(stopId);
    const indexes = [];

    for (let index = 0; index < stopTimes.length; index++) {
        if (String(stopTimes[index].stopId) === normalizedStopId) {
            indexes.push(index);
        }
    }

    return indexes;
}


/*
 * Expands catchable scheduled trips from one physical-stop state.
 *
 * Each accepted downstream arrival is recorded in bestLabels and placed in
 * the same earliest-arrival frontier as walking states. Actual trip IDs and
 * ordered stop_times, rather than route IDs alone, establish reachability.
 */
function expandTransitStates({
    state,
    travelDate,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    frontier,
    bestLabels,
    minimumTransferSeconds = 300,
    maximumWaitSeconds = 7200,
    maximumRideSeconds = 14400,
    maximumBoardings = 4,
    requestedDepartureTimeSeconds = null,
    allowedRouteTypes = null
}) {
    if (!state || !frontier || !bestLabels) {
        throw new TypeError(
            "Transit expansion requires state, frontier, and bestLabels."
        );
    }

    const currentStop = stopById.get(String(state.stopId));

    if (!currentStop) {
        throw new Error(
            `Physical stop ${state.stopId} is missing from stopById.`
        );
    }

    const activeServices = serviceByDate.get(travelDate);
    const acceptedStates = [];
    const rejected = {
        inactiveService: 0,
        missingStopTimes: 0,
        stopNotOnTrip: 0,
        departed: 0,
        waitLimit: 0,
        rideLimit: 0,
        boardingLimit: 0,
        sameTripAlreadyExpanded: 0,
        invalidTime: 0,
        dominated: 0
    };

    if (!activeServices) {
        return {
            routesChecked: 0,
            tripsChecked: 0,
            acceptedStates,
            rejected,
            noActiveService: true
        };
    }

    const routes = currentStop.routes || [];
    let tripsChecked = 0;

    for (const route of routes) {
        const routeId = String(route.routeId);
        const trips = tripsByRoute.get(routeId) || [];

        for (const trip of trips) {
            tripsChecked++;

            /*
             * Boarding expansion eagerly created states for every downstream
             * stop on this trip. Re-scanning the same trip from one of those
             * states would only recreate equivalent continuations.
             */
            if (
                state.tripId !== null &&
                String(state.tripId) === String(trip.tripId)
            ) {
                rejected.sameTripAlreadyExpanded++;
                continue;
            }

            if (!activeServices.has(trip.serviceId)) {
                rejected.inactiveService++;
                continue;
            }

            if (allowedRouteTypes &&
                !allowedRouteTypes.includes(String(trip.routeType))) continue;

            if (
                !isTripEligibleForSearch(
                    trip,
                    requestedDepartureTimeSeconds ?? state.arrivalTimeSeconds
                )
            ) {
                continue;
            }

            const stopTimes = stopTimesByTrip.get(trip.tripId);

            if (!stopTimes || stopTimes.length === 0) {
                rejected.missingStopTimes++;
                continue;
            }

            const boardingIndexes = findBoardingIndexes(
                stopTimes,
                state.stopId
            );

            if (boardingIndexes.length === 0) {
                rejected.stopNotOnTrip++;
                continue;
            }

            const nextBoardings = state.boardings + 1;

            if (nextBoardings > maximumBoardings) {
                rejected.boardingLimit++;
                continue;
            }

            const transferBuffer =
                state.boardings > 0
                    ? minimumTransferSeconds
                    : 0;

            const earliestBoardingTime =
                state.arrivalTimeSeconds + transferBuffer;

            for (const boardingIndex of boardingIndexes) {
                const boardingStopTime = stopTimes[boardingIndex];
                let departureSeconds;

                try {
                    departureSeconds = gtfsTimeToSeconds(
                        boardingStopTime.departureTime
                    );
                } catch {
                    rejected.invalidTime++;
                    continue;
                }

                if (departureSeconds < earliestBoardingTime) {
                    rejected.departed++;
                    continue;
                }

                if (
                    departureSeconds - state.arrivalTimeSeconds >
                    maximumWaitSeconds
                ) {
                    rejected.waitLimit++;
                    continue;
                }

                for (
                    let downstreamIndex = boardingIndex + 1;
                    downstreamIndex < stopTimes.length;
                    downstreamIndex++
                ) {
                    const downstream = stopTimes[downstreamIndex];
                    let arrivalSeconds;

                    try {
                        arrivalSeconds = gtfsTimeToSeconds(
                            downstream.arrivalTime
                        );
                    } catch {
                        rejected.invalidTime++;
                        continue;
                    }

                    if (
                        arrivalSeconds < departureSeconds ||
                        arrivalSeconds - departureSeconds >
                            maximumRideSeconds
                    ) {
                        rejected.rideLimit++;
                        continue;
                    }

                    const nextState = createSearchState({
                        stopId: downstream.stopId,
                        arrivalTimeSeconds: arrivalSeconds,
                        routeId,
                        tripId: trip.tripId,
                        boardings: nextBoardings,
                        transfers: Math.max(0, nextBoardings - 1),
                        walkingSeconds: state.walkingSeconds,
                        walkingMetres: state.walkingMetres,
                        previousState: state,
                        action: Object.freeze({
                            type: "transit",
                            routeId,
                            tripId: String(trip.tripId),
                            headsign: trip.headsign || null,
                            routeType: trip.routeType ?? null,
                            transitMode:
                                String(trip.routeType) === "0" ? "train" : "bus",
                            fromStopId: String(state.stopId),
                            toStopId: String(downstream.stopId),
                            departureTime: boardingStopTime.departureTime,
                            arrivalTime: downstream.arrivalTime,
                            departureTimeSeconds: departureSeconds,
                            arrivalTimeSeconds: arrivalSeconds,
                            waitSeconds:
                                departureSeconds - state.arrivalTimeSeconds,
                            boarding: true
                        })
                    });

                    if (!bestLabels.accept(nextState)) {
                        rejected.dominated++;
                        continue;
                    }

                    frontier.enqueue(nextState);
                    acceptedStates.push(nextState);
                }
            }
        }
    }

    return {
        routesChecked: routes.length,
        tripsChecked,
        acceptedStates,
        rejected,
        noActiveService: false
    };
}


module.exports = {
    expandTransitStates,
    findBoardingIndexes
};
