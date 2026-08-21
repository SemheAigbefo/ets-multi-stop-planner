/*
 * Finds routes that serve both the origin
 * and destination stops.
 *
 * This is our first step toward finding
 * a direct transit trip.
 */

function findDirectRoutes(originStop, destinationStop) { //routes that serve both stops/all stops

    // Get the route IDs serving each stop
    const originRoutes = originStop.routes;
    const destinationRoutes = destinationStop.routes;


    /*
     * Find routes that appear at both stops.
     */

    const directRoutes = originRoutes.filter(originRoute =>
        destinationRoutes.some(
            destinationRoute =>
                destinationRoute.routeId === originRoute.routeId
        )
    );


    return directRoutes;
}


module.exports = findDirectRoutes;