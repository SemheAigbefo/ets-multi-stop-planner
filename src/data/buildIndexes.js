/*Make searching faster with hashmap*/
/* map is like a dictionary where the key can be any datatype, i.e func, obj and primitives */

const {
    insert
} = require("../spatial/nearestStop");

const {
    readGtfsFile
} = require("./loadGtfs");


function buildIndexes(stops) {

    const stopMap = new Map();

    /* Physical GTFS stop ID -> stop record for graph-search states. */
    const stopById = new Map();

    let kdTree = null;


    // --------------------------------
    // STOP MAP + KD TREE
    // --------------------------------

    /*
     * stopMap now stores:
     *
     * stop name -> array of GTFS stop records
     *
     * This is important because a transit centre can
     * have multiple physical stop IDs / bays that all
     * use the same stop name.
     *
     * Example:
     *
     * "West Edmonton Mall Transit Centre"
     *      -> [
     *          stop 5840,
     *          stop 5841,
     *          stop 5842,
     *          ...
     *         ]
     *
     * Previously, stopMap.set(name, stop) caused each
     * duplicate name to overwrite the previous stop.
     */

    for (const stop of stops) { /*for stop in list of stops */

        const {
            name,
            stopId,
            lat,
            lon,
            routes
        } = stop;


        /*
         * If this stop name does not exist in the Map yet,
         * create an empty array for all physical stops
         * with that name.
         */
        if (!stopMap.has(name)) {

            stopMap.set(
                name,
                []
            );
        }


        /*
         * Add this individual GTFS stop record to the
         * array belonging to this stop name.
         *
         * stop is an object from stopsRouteJoin.json,
         * map is a key value pair.
         */
        stopMap.get(name).push({

            stopId,

            name,

            lat,

            lon,

            routes
        });

        stopById.set(String(stopId), {
            stopId,
            name,
            lat,
            lon,
            routes
        });


        /*
         * The KD-tree still stores each individual
         * physical ETS stop separately.
         */
        kdTree = insert(
            kdTree,
            stop
        );
    }


    // --------------------------------
    // TRIPS BY ROUTE
    // --------------------------------

    /*
     * Reads trips.txt and creates a Map where:
     *
     * route ID -> array of trips
     *
     * This allows us to quickly find all scheduled
     * trips belonging to a particular route.
     */

    const trips =
        readGtfsFile("trips.txt");
    const routeTypeById = new Map(
        readGtfsFile("routes.txt").map(route => [
            String(route.route_id),
            String(route.route_type)
        ])
    );


    const tripsByRoute =
        new Map();


    for (const trip of trips) {

        const {
            route_id,
            service_id,
            trip_id,
            trip_headsign,
            direction_id
        } = trip;


        /*
         * If this route doesn't have an entry yet,
         * create an empty array for its trips.
         */
        if (!tripsByRoute.has(route_id)) {

            tripsByRoute.set(
                route_id,
                []
            );
        }


        /*
         * Add this trip to the array belonging
         * to its route.
         */
        tripsByRoute
            .get(route_id)
            .push({

                tripId: trip_id,

                serviceId: service_id,

                headsign: trip_headsign,

                directionId: direction_id,

                routeType: routeTypeById.get(String(route_id)) ?? null
            });
    }


    // --------------------------------
    // STOP TIMES BY TRIP
    // --------------------------------

    /*
     * Reads stop_times.txt and creates a Map where:
     *
     * trip ID -> array of stops and their times
     *
     * This allows us to quickly find the sequence
     * of stops that a particular trip visits.
     */

    const stopTimes =
        readGtfsFile("stop_times.txt");


    const stopTimesByTrip =
        new Map();


    for (const stopTime of stopTimes) {

        const {
            trip_id,
            arrival_time,
            departure_time,
            stop_id,
            stop_sequence
        } = stopTime;


        /*
         * If this trip doesn't have an entry yet,
         * create an empty array for its stop times.
         */
        if (!stopTimesByTrip.has(trip_id)) {

            stopTimesByTrip.set(
                trip_id,
                []
            );
        }


        /*
         * Add this stop to the trip's list.
         */
        stopTimesByTrip
            .get(trip_id)
            .push({

                stopId: stop_id,

                arrivalTime: arrival_time,

                departureTime: departure_time,

                stopSequence:
                    Number(stop_sequence)
            });
    }


    // --------------------------------
    // SORT STOP TIMES
    // --------------------------------

    /*
     * Sort the stops for every trip using
     * stop_sequence so they are in the order
     * the vehicle actually visits them.
     */

    for (
        const tripStopTimes
        of stopTimesByTrip.values()
    ) {

        tripStopTimes.sort(
            (a, b) =>
                a.stopSequence -
                b.stopSequence
        );
    }


    // --------------------------------
    // SERVICE BY DATE
    // --------------------------------

    /*
     * Reads calendar_dates.txt and creates a Map where:
     *
     * date -> service IDs
     *
     * This allows us to quickly determine which
     * services operate on a particular date.
     */

    const calendarDates =
        readGtfsFile(
            "calendar_dates.txt"
        );


    const serviceByDate =
        new Map();


    for (
        const calendarDate
        of calendarDates
    ) {

        const {
            service_id,
            date,
            exception_type
        } = calendarDate;


        /*
         * If this date doesn't have an entry yet,
         * create an empty Set for its service IDs.
         */
        if (!serviceByDate.has(date)) {

            serviceByDate.set(
                date,
                new Set()
            );
        }


        /*
         * exception_type:
         *
         * 1 = service is added
         * 2 = service is removed
         */
        if (exception_type === "1") {

            serviceByDate
                .get(date)
                .add(service_id);

        } else if (
            exception_type === "2"
        ) {

            serviceByDate
                .get(date)
                .delete(service_id);
        }
    }


    // --------------------------------
    // RETURN ALL INDEXES
    // --------------------------------

    return {

        stopMap,

        stopById,

        kdTree,

        tripsByRoute,

        stopTimesByTrip,

        serviceByDate
    };
}


module.exports =
    buildIndexes;
