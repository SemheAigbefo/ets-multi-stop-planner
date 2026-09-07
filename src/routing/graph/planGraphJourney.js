const createSearchState = require("./createSearchState");
const MinPriorityQueue = require("./MinPriorityQueue");
const {
    BestLabels
} = require("./BestLabels");
const {
    reconstructStates,
    reconstructActions
} = require("./reconstructPath");
const mergeItineraryActions =
    require("./mergeItineraryActions");
const {
    expandWalkingStates
} = require("./expandWalkingStates");
const {
    expandTransitStates
} = require("./expandTransitStates");
const {
    gtfsTimeToSeconds,
    secondsToGtfsTime
} = require("./gtfsTime");
const estimateWalking = require("./estimateWalking");
const {
    distanceMetres
} = require("../../spatial/nearestStop");

const ORIGIN_LOCATION_ID = "__user_origin__";
const DESTINATION_LOCATION_ID = "__user_destination__";


function addRejectionCounts(target, source) {
    for (const [reason, count] of Object.entries(source)) {
        target[reason] = (target[reason] || 0) + count;
    }
}


/*
 * Runs one origin-to-destination, time-dependent graph search.
 *
 * Walking and transit successors enter one minimum-priority frontier. The
 * destination is finalized only when it is removed as the earliest current
 * state, which is the Dijkstra termination rule for this cost model.
 */
function planGraphJourney({
    originStopIds,
    destinationStopIds,
    originLocation = null,
    destinationLocation = null,
    travelDate,
    departureTime,
    departureTimeSeconds,
    kdTree,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    walking = {},
    transit = {},
    maximumJourneySeconds = 4 * 3600,
    maximumProcessedStates = 20000,
    maximumAcceptedLabels = 50000
}) {
    if (!Array.isArray(originStopIds) || originStopIds.length === 0) {
        throw new TypeError("At least one physical origin stop is required.");
    }

    if (
        !Array.isArray(destinationStopIds) ||
        destinationStopIds.length === 0
    ) {
        throw new TypeError(
            "At least one physical destination stop is required."
        );
    }

    const startTime = departureTimeSeconds === undefined
        ? gtfsTimeToSeconds(departureTime)
        : Number(departureTimeSeconds);

    if (!Number.isFinite(startTime) || startTime < 0) {
        throw new TypeError("A valid departure time is required.");
    }

    const destinationCandidateStops = new Set(
        destinationStopIds.map(String)
    );
    const frontier = new MinPriorityQueue();
    const bestLabels = new BestLabels();
    const statistics = {
        originStates: 0,
        processedStates: 0,
        staleStatesSkipped: 0,
        overDurationSkipped: 0,
        walkingCandidatesChecked: 0,
        walkingStatesAccepted: 0,
        transitRoutesChecked: 0,
        transitTripsChecked: 0,
        transitStatesAccepted: 0,
        walkingRejected: {},
        transitRejected: {}
    };

    const walkingSettings = {
        maximumSegmentMetres: 600,
        maximumTotalWalkingMetres: 1800,
        maximumTotalWalkingSeconds: 1800,
        walkingSpeedMetresPerSecond: 1.4,
        detourFactor: 1.2,
        ...walking
    };

    const syntheticOrigin = originLocation
        ? createSearchState({
            stopId: ORIGIN_LOCATION_ID,
            arrivalTimeSeconds: startTime
        })
        : null;

    for (const stopId of new Set(originStopIds.map(String))) {
        const originStop = stopById.get(stopId);

        if (!originStop) {
            throw new Error(`Origin stop ${stopId} is missing from stopById.`);
        }

        let originState;

        if (originLocation) {
            const accessWalk = estimateWalking(
                distanceMetres(
                    originLocation.lat,
                    originLocation.lon,
                    originStop.lat,
                    originStop.lon
                ),
                walkingSettings
            );

            if (
                accessWalk.distanceMetres >
                    walkingSettings.maximumSegmentMetres ||
                accessWalk.distanceMetres >
                    walkingSettings.maximumTotalWalkingMetres ||
                accessWalk.durationSeconds >
                    walkingSettings.maximumTotalWalkingSeconds
            ) {
                continue;
            }

            originState = createSearchState({
                stopId,
                arrivalTimeSeconds:
                    startTime + accessWalk.durationSeconds,
                walkingSeconds: accessWalk.durationSeconds,
                walkingMetres: accessWalk.distanceMetres,
                previousState: syntheticOrigin,
                action: Object.freeze({
                    type: "walk",
                    fromStopId: null,
                    toStopId: stopId,
                    fromLocation: { ...originLocation },
                    straightLineMetres:
                        accessWalk.straightLineMetres,
                    distanceMetres: accessWalk.distanceMetres,
                    durationSeconds: accessWalk.durationSeconds,
                    estimated: true,
                    accessWalk: true
                })
            });
        } else {
            originState = createSearchState({
                stopId,
                arrivalTimeSeconds: startTime
            });
        }

        if (bestLabels.accept(originState)) {
            frontier.enqueue(originState);
            statistics.originStates++;
        }
    }

    while (!frontier.isEmpty()) {
        if (statistics.processedStates >= maximumProcessedStates) {
            return failureResult(
                "maximum_processed_states",
                startTime,
                statistics,
                bestLabels
            );
        }

        const state = frontier.dequeue();

        if (!bestLabels.isCurrent(state)) {
            statistics.staleStatesSkipped++;
            continue;
        }

        if (
            state.arrivalTimeSeconds - startTime >
            maximumJourneySeconds
        ) {
            statistics.overDurationSkipped++;
            break;
        }

        statistics.processedStates++;

        const destinationReached = destinationLocation
            ? String(state.stopId) === DESTINATION_LOCATION_ID
            : destinationCandidateStops.has(String(state.stopId));

        if (destinationReached) {
            const states = reconstructStates(state);
            const actions = reconstructActions(state);

            return {
                success: true,
                departureTime: secondsToGtfsTime(startTime),
                arrivalTime:
                    secondsToGtfsTime(state.arrivalTimeSeconds),
                departureTimeSeconds: startTime,
                arrivalTimeSeconds: state.arrivalTimeSeconds,
                durationSeconds:
                    state.arrivalTimeSeconds - startTime,
                destinationStopId: String(state.stopId),
                boardings: state.boardings,
                transfers: state.transfers,
                walkingSeconds: state.walkingSeconds,
                walkingMetres: state.walkingMetres,
                states,
                actions,
                itinerary: mergeItineraryActions(actions),
                statistics: {
                    ...statistics,
                    acceptedLabels: bestLabels.size
                }
            };
        }

        if (
            destinationLocation &&
            destinationCandidateStops.has(String(state.stopId))
        ) {
            const arrivalStop = stopById.get(String(state.stopId));
            const finalWalk = estimateWalking(
                distanceMetres(
                    arrivalStop.lat,
                    arrivalStop.lon,
                    destinationLocation.lat,
                    destinationLocation.lon
                ),
                walkingSettings
            );
            const finalWalkingMetres =
                state.walkingMetres + finalWalk.distanceMetres;
            const finalWalkingSeconds =
                state.walkingSeconds + finalWalk.durationSeconds;

            if (
                finalWalk.distanceMetres <=
                    walkingSettings.maximumSegmentMetres &&
                finalWalkingMetres <=
                    walkingSettings.maximumTotalWalkingMetres &&
                finalWalkingSeconds <=
                    walkingSettings.maximumTotalWalkingSeconds
            ) {
                const finalState = createSearchState({
                    stopId: DESTINATION_LOCATION_ID,
                    arrivalTimeSeconds:
                        state.arrivalTimeSeconds +
                        finalWalk.durationSeconds,
                    boardings: state.boardings,
                    transfers: state.transfers,
                    walkingSeconds: finalWalkingSeconds,
                    walkingMetres: finalWalkingMetres,
                    previousState: state,
                    action: Object.freeze({
                        type: "walk",
                        fromStopId: String(state.stopId),
                        toStopId: null,
                        toLocation: { ...destinationLocation },
                        straightLineMetres:
                            finalWalk.straightLineMetres,
                        distanceMetres: finalWalk.distanceMetres,
                        durationSeconds: finalWalk.durationSeconds,
                        estimated: true,
                        finalWalk: true
                    })
                });

                if (bestLabels.accept(finalState)) {
                    frontier.enqueue(finalState);
                    statistics.walkingStatesAccepted++;
                }
            }
        }

        const transitResult = expandTransitStates({
            state,
            travelDate,
            requestedDepartureTimeSeconds: startTime,
            stopById,
            tripsByRoute,
            stopTimesByTrip,
            serviceByDate,
            frontier,
            bestLabels,
            ...transit
        });

        statistics.transitRoutesChecked +=
            transitResult.routesChecked;
        statistics.transitTripsChecked +=
            transitResult.tripsChecked;
        statistics.transitStatesAccepted +=
            transitResult.acceptedStates.length;
        addRejectionCounts(
            statistics.transitRejected,
            transitResult.rejected
        );

        const walkingResult = expandWalkingStates({
            state,
            kdTree,
            stopById,
            frontier,
            bestLabels,
            ...walkingSettings
        });

        statistics.walkingCandidatesChecked +=
            walkingResult.candidatesChecked;
        statistics.walkingStatesAccepted +=
            walkingResult.acceptedStates.length;
        addRejectionCounts(
            statistics.walkingRejected,
            walkingResult.rejected
        );

        if (bestLabels.size > maximumAcceptedLabels) {
            return failureResult(
                "maximum_accepted_labels",
                startTime,
                statistics,
                bestLabels
            );
        }
    }

    return failureResult(
        "destination_unreachable",
        startTime,
        statistics,
        bestLabels
    );
}


function failureResult(reason, startTime, statistics, bestLabels) {
    return {
        success: false,
        reason,
        departureTime: secondsToGtfsTime(startTime),
        departureTimeSeconds: startTime,
        itinerary: [],
        statistics: {
            ...statistics,
            acceptedLabels: bestLabels.size
        }
    };
}


module.exports = planGraphJourney;
