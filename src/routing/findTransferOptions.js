/*
 * Finds possible one-transfer route combinations:
 *
 * origin
 *   → firstRoute
 *   → transfer location
 *   → secondRoute
 *   → destination
 *
 * This function only finds structural possibilities.
 * It does not validate trip schedules yet.
 */
function findTransferOptions(
    originStop,
    destinationStop,
    stopMap
) {
    const options = [];
    const originRouteIds = new Set(originStop.routes.map(route => route.routeId)); //map loops over routes array from server.js,route is each route obj during map()
    const destinationRouteIds = new Set(destinationStop.routes.map(route => route.routeId));

    /*
     * stopMap:
     *
     * logical stop name
     *     → array of physical GTFS stops/bays
     */
    for (const [transferName, physicalStops]of stopMap) { //stopMap in buildingIndexes.js
        /*
         * The origin and destination should not also
         * be treated as transfer locations.
         */
        if (transferName === originStop.name ||transferName === destinationStop.name) 
        {continue;}
        /*
         * Combine every route serving every physical
         * stop at this logical transfer location.
         */
        const transferRoutesById =new Map();
        for (const physicalStop of physicalStops) {
        for (const route of physicalStop.routes || []) {
                transferRoutesById.set(
                    route.routeId,
                    route
                );
            }
        }

        const transferRoutes =
            [...transferRoutesById.values()];


        /*
         * First-leg routes must serve both:
         *
         * origin + transfer location
         */
        const firstLegRoutes =
            transferRoutes.filter(
                route =>
                    originRouteIds.has(
                        route.routeId
                    )
            );


        /*
         * Second-leg routes must serve both:
         *
         * transfer location + destination
         */
        const secondLegRoutes =
            transferRoutes.filter(
                route =>
                    destinationRouteIds.has(
                        route.routeId
                    )
            );


        /*
         * Combine every valid first route with every
         * valid second route.
         */
        for (const firstRoute of firstLegRoutes) {
            for (const secondRoute of secondLegRoutes) {
                /*
                 * Using the same route for both legs
                 * would not actually be a transfer.
                 */
                if (firstRoute.routeId ===secondRoute.routeId) {
                    continue;}
                options.push({transferStop: {name:transferName,stopIds:physicalStops.map(stop => stop.stopId),routes:transferRoutes},

                    firstRoute:
                        firstRoute,

                    secondRoute:
                        secondRoute
                });
            }
        }
    }

    return options;
}


module.exports =
    findTransferOptions;