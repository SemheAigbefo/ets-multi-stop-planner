const {
    withinRadius
} = require("../../spatial/nearestStop");

const createSearchState =
    require("./createSearchState");

const estimateWalking =
    require("./estimateWalking");


/*
 * Walking back to any stop already in the current predecessor chain cannot
 * improve this journey: it adds time and walking without adding reachability.
 * Rejecting it prevents A -> B -> A and longer walking cycles.
 */
function collectVisitedStopIds(state) {
    const visited = new Set();
    let current = state;

    while (current) {
        visited.add(String(current.stopId));
        current = current.previousState;
    }

    return visited;
}


/*
 * Expands walking connections from one finalized search state.
 *
 * Useful candidates are recorded in bestLabels and added to the same
 * minimum-priority frontier used by transit states. Walking leaves the
 * passenger off-board, so routeId and tripId are cleared.
 */
function expandWalkingStates({
    state,
    kdTree,
    stopById,
    frontier,
    bestLabels,
    maximumSegmentMetres = 600,
    maximumTotalWalkingMetres = 1800,
    maximumTotalWalkingSeconds = 1800,
    walkingSpeedMetresPerSecond = 1.4,
    detourFactor = 1.2
}) {
    if (!state || !frontier || !bestLabels) {
        throw new TypeError(
            "Walking expansion requires state, frontier, and bestLabels."
        );
    }

    const currentStop = stopById.get(String(state.stopId));

    if (!currentStop) {
        throw new Error(
            `Physical stop ${state.stopId} is missing from stopById.`
        );
    }

    const visitedStopIds = collectVisitedStopIds(state);
    const nearby = withinRadius(
        kdTree,
        currentStop.lat,
        currentStop.lon,
        maximumSegmentMetres
    );

    const acceptedStates = [];
    const rejected = {
        currentOrVisited: 0,
        segmentLimit: 0,
        totalLimit: 0,
        dominated: 0
    };

    for (const candidate of nearby) {
        const destinationStopId = String(candidate.stop.stopId);

        if (visitedStopIds.has(destinationStopId)) {
            rejected.currentOrVisited++;
            continue;
        }

        const walking = estimateWalking(
            candidate.distanceMetres,
            {
                walkingSpeedMetresPerSecond,
                detourFactor
            }
        );

        // The KD query uses straight-line distance; enforce the configured
        // limit again after applying the walking detour factor.
        if (walking.distanceMetres > maximumSegmentMetres) {
            rejected.segmentLimit++;
            continue;
        }

        const totalWalkingMetres =
            state.walkingMetres + walking.distanceMetres;
        const totalWalkingSeconds =
            state.walkingSeconds + walking.durationSeconds;

        if (
            totalWalkingMetres > maximumTotalWalkingMetres ||
            totalWalkingSeconds > maximumTotalWalkingSeconds
        ) {
            rejected.totalLimit++;
            continue;
        }

        const nextState = createSearchState({
            stopId: destinationStopId,
            arrivalTimeSeconds:
                state.arrivalTimeSeconds + walking.durationSeconds,
            routeId: null,
            tripId: null,
            boardings: state.boardings,
            transfers: state.transfers,
            walkingSeconds: totalWalkingSeconds,
            walkingMetres: totalWalkingMetres,
            previousState: state,
            action: Object.freeze({
                type: "walk",
                fromStopId: String(state.stopId),
                toStopId: destinationStopId,
                straightLineMetres: walking.straightLineMetres,
                distanceMetres: walking.distanceMetres,
                durationSeconds: walking.durationSeconds,
                estimated: true
            })
        });

        if (!bestLabels.accept(nextState)) {
            rejected.dominated++;
            continue;
        }

        frontier.enqueue(nextState);
        acceptedStates.push(nextState);
    }

    return {
        candidatesChecked: nearby.length,
        acceptedStates,
        rejected
    };
}


module.exports = {
    expandWalkingStates,
    collectVisitedStopIds
};
