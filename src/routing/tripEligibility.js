/*
 * ETS publishes the daytime Route 9 and the overnight Route 9 Owl under the
 * same route_id (009).  A route ID therefore cannot decide whether a trip is
 * suitable for a daytime search; the trip headsign must also be considered.
 */
const DAYTIME_START_SECONDS = 6 * 60 * 60;
const DAYTIME_END_SECONDS = 22 * 60 * 60;


function isOwlTrip(tripOrConnection) {
    return /(?:^|[-\s])owl(?:$|[-\s])/i.test(
        String(tripOrConnection?.headsign || "")
    );
}


function isDaytime(seconds) {
    if (!Number.isFinite(Number(seconds))) return false;

    const secondsInDay = 24 * 60 * 60;
    const localSeconds =
        ((Number(seconds) % secondsInDay) + secondsInDay) % secondsInDay;

    return localSeconds >= DAYTIME_START_SECONDS &&
        localSeconds < DAYTIME_END_SECONDS;
}


/* Ordinary trips are always eligible. Owl trips are excluded only when the
 * user's original requested departure is during the daytime window. */
function isTripEligibleForSearch(tripOrConnection, requestedTimeSeconds) {
    return !isOwlTrip(tripOrConnection) || !isDaytime(requestedTimeSeconds);
}


module.exports = {
    DAYTIME_START_SECONDS,
    DAYTIME_END_SECONDS,
    isOwlTrip,
    isDaytime,
    isTripEligibleForSearch
};
