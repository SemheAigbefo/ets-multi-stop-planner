/*
 * Converts a GTFS time into seconds.
 * Supports times greater than 24:00:00.
 */
function timeToSeconds(time) {
    const [hours, minutes, seconds = 0] =
        time.split(":").map(Number);

    return (
        hours * 3600 +
        minutes * 60 +
        seconds
    );
}


/*
 * Selects the direct trip that arrives earliest.
 *
 * Returns null when no valid direct trip exists.
 */
function selectBestDirectTrip(directTrips) {
    if (
        !Array.isArray(directTrips) ||
        directTrips.length === 0
    ) {
        return null;
    }

    let bestTrip = directTrips[0];

    for (const trip of directTrips) {
        const tripArrival =
            timeToSeconds(trip.arrivalTime);

        const bestArrival =
            timeToSeconds(bestTrip.arrivalTime);

        if (tripArrival < bestArrival) {
            bestTrip = trip;
        }
    }

    const departureSeconds =
        timeToSeconds(bestTrip.departureTime);

    const arrivalSeconds =
        timeToSeconds(bestTrip.arrivalTime);

    return {
        ...bestTrip,

        travelTimeMinutes:
            Math.round(
                (arrivalSeconds - departureSeconds) / 60
            )
    };
}


module.exports =
    selectBestDirectTrip;