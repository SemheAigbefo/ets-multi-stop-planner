/*
 * Creates one immutable label in the time-dependent graph search.
 *
 * A stop ID alone is not enough to describe a journey. The router also
 * needs to know when the passenger arrived, whether they are currently
 * on a trip, and how many transfers and walking costs were accumulated.
 */
function createSearchState({
    stopId,
    arrivalTimeSeconds,
    routeId = null,
    tripId = null,
    boardings = 0,
    transfers = 0,
    walkingSeconds = 0,
    walkingMetres = 0,
    previousState = null,
    action = null
}) {
    if (stopId === undefined || stopId === null || stopId === "") {
        throw new TypeError("A search state requires a physical stopId.");
    }

    const numericFields = {
        arrivalTimeSeconds,
        boardings,
        transfers,
        walkingSeconds,
        walkingMetres
    };

    for (const [name, value] of Object.entries(numericFields)) {
        if (!Number.isFinite(value) || value < 0) {
            throw new TypeError(
                `Search-state ${name} must be a non-negative number.`
            );
        }
    }

    if (transfers > Math.max(0, boardings - 1)) {
        throw new RangeError(
            "Transfers cannot exceed the number implied by boardings."
        );
    }

    return Object.freeze({
        stopId: String(stopId),
        arrivalTimeSeconds,
        routeId: routeId === null ? null : String(routeId),
        tripId: tripId === null ? null : String(tripId),
        boardings,
        transfers,
        walkingSeconds,
        walkingMetres,
        previousState,
        action
    });
}


module.exports = createSearchState;
