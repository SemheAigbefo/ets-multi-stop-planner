/*
 * Gets all routes serving an ETS stop.
 *
 * The routes are already attached to each stop
 * in stopsRouteJoin.json, so we don't need to
 * search the GTFS data again.
 */
function getRoutesByStop(stop) {
    if (!stop) { //if no stop, return nothing else return stops or empty array
        return [];
    }
    return stop.routes || [];
}

module.exports = getRoutesByStop;