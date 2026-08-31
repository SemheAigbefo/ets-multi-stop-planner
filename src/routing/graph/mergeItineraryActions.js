/*
 * Combines adjacent actions when they describe one uninterrupted movement.
 * This keeps internal search labels out of the user-facing itinerary.
 */
function mergeItineraryActions(actions) {
    const merged = [];

    for (const action of actions) {
        const previous = merged[merged.length - 1];

        if (
            previous &&
            previous.type === "walk" &&
            action.type === "walk" &&
            previous.toStopId === action.fromStopId
        ) {
            previous.toStopId = action.toStopId;
            previous.toLocation = action.toLocation || null;
            previous.straightLineMetres +=
                action.straightLineMetres;
            previous.distanceMetres += action.distanceMetres;
            previous.durationSeconds += action.durationSeconds;
            previous.estimated =
                previous.estimated || action.estimated;
            continue;
        }

        if (
            previous &&
            previous.type === "transit" &&
            action.type === "transit" &&
            previous.tripId === action.tripId &&
            previous.toStopId === action.fromStopId
        ) {
            previous.toStopId = action.toStopId;
            previous.arrivalTime = action.arrivalTime;
            previous.arrivalTimeSeconds =
                action.arrivalTimeSeconds;
            continue;
        }

        merged.push({ ...action });
    }

    return merged;
}


module.exports = mergeItineraryActions;
