require("dotenv").config();

const express = require("express"); //imports Express library
const cors = require("cors"); //imports cors

const stopsData =
    require("./data/processed/stopsRouteJoin.json"); //imports processed ETS stop data

const buildIndexes =
    require("./src/data/buildIndexes"); //imports function that builds stopMap and KD-tree

const getCoordinates =
    require("./src/geocode/coordFun"); //imports geocoding function

const {
    nearest
} = require("./src/spatial/nearestStop"); //imports KD-tree nearest-stop function

const getRoutesByStop =
    require("./src/routes/getRouteByStop");

const findDirectRoutes =
    require("./src/routing/findDirectRoutes");

const findDirectTrips =
    require("./src/routing/findDirectTrips");


const app = express(); //instance of Express application

const PORT = 3000; // where the server will run, follow industry standards, should not be hardcoded


// Allow Express to read JSON sent by fetch()
app.use(cors());

app.use(express.json()); //middleware that tells Exp serv to read and parse incoming data


/*
 * Build indexes once when the server starts.
 *
 * stopMap:
 *      stop name → array of physical GTFS stop records
 *
 * kdTree:
 *      coordinates → nearby ETS stops
 *
 * tripsByRoute:
 *      route ID → array of scheduled trips
 *
 * stopTimesByTrip:
 *      trip ID → ordered stop times
 *
 * serviceByDate:
 *      date → active service IDs
 *
 * We build these once instead of rebuilding them
 * every time a user submits the form.
 */
const {
    stopMap,
    kdTree,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate
} = buildIndexes(stopsData);


/*
 * Combines the routes from multiple physical stops
 * without returning duplicate routes.
 *
 * Example:
 *
 * WEM bay A -> 004, 900X
 * WEM bay B -> 056, 914
 *
 * Combined:
 *
 * 004, 900X, 056, 914
 */
function combineRoutes(stops) {

    const routesById =
        new Map();


    for (const stop of stops) {

        const routes =
            stop.routes || [];


        for (const route of routes) {

            /*
             * routeId is used as the Map key,
             * so duplicate route IDs overwrite each
             * other instead of appearing multiple times.
             */
            routesById.set(
                route.routeId,
                route
            );
        }
    }


    return Array.from(
        routesById.values()
    );
}


/*
 * POST /api/route
 *
 * Receives the user's stops and departure time
 * from the frontend.
 */
app.post("/api/route", async (req, res) => {

    const {
        stops,
        departureTime,
        travelDate
    } = req.body; //object destructuring; extract properties stops and departureTime from request


    console.log(
        "Stops:",
        stops
    );


    console.log(
        "Departure time:",
        departureTime
    );


    try {

        // Stores the processed information for each user stop
        const results = [];


        /*
         * Process every stop submitted by the user.
         */
        for (const stop of stops) {

            /*
             * stopMap now returns an ARRAY because
             * several GTFS stop IDs can share the same
             * stop/transit-centre name.
             */
            const exactStops =
                stopMap.get(stop.name);


            let coordinates;

            let physicalStops;

            let kdDistance;


            /*
             * CASE 1:
             *
             * The user entered the exact name of
             * an ETS stop/transit centre.
             */
            if (
                exactStops &&
                exactStops.length > 0
            ) {

                /*
                 * Keep ALL physical stops / bays.
                 *
                 * We do not collapse them into one stopId,
                 * because different routes may use
                 * different bays.
                 */
                physicalStops =
                    exactStops;


                /*
                 * For location/display purposes, use
                 * the coordinates of the first stop.
                 *
                 * The individual stop coordinates remain
                 * available inside physicalStops.
                 */
                coordinates = {

                    lat:
                        exactStops[0].lat,

                    lon:
                        exactStops[0].lon
                };


                /*
                 * Since this was an exact lookup,
                 * no KD-tree distance was needed.
                 */
                kdDistance = 0;


            } else {

                /*
                 * CASE 2:
                 *
                 * The user entered a normal location,
                 * such as "West Edmonton Mall".
                 *
                 * coordFun.js will use Google Geocoding.
                 */
                coordinates =
                    await getCoordinates(
                        stop.name,
                        stopMap
                    );


                if (!coordinates) {

                    throw new Error(
                        `Could not find coordinates for ${stop.name}`
                    );
                }


                /*
                 * Find the nearest physical ETS stop
                 * using the KD-tree.
                 */
                const nearestResult =
                    nearest(
                        kdTree,
                        coordinates.lat,
                        coordinates.lon
                    );


                if (
                    !nearestResult ||
                    !nearestResult.stop
                ) {

                    throw new Error(
                        `Could not find nearest ETS stop for ${stop.name}`
                    );
                }


                /*
                 * A normal geocoded location currently
                 * gives us one KD-tree candidate.
                 *
                 * Later we can upgrade this to several
                 * nearby candidate stops for walking-route
                 * comparison.
                 */
                physicalStops = [
                    nearestResult.stop
                ];


                kdDistance =
                    nearestResult.distance;
            }


            /*
             * Combine all routes served by all physical
             * stops/bays belonging to this location.
             */
            const routes =
                combineRoutes(
                    physicalStops
                );


            /*
             * Build a routing-friendly representation
             * of the location.
             *
             * stopIds preserves every physical GTFS ID.
             *
             * routes contains the union of routes served
             * across those physical stops.
             */
            const routingStop = {

                name:
                    stop.name,

                stopIds:
                    physicalStops.map(
                        physicalStop =>
                            physicalStop.stopId
                    ),

                routes:
                    routes,

                physicalStops:
                    physicalStops
            };


            /*
             * Store all relevant information so it can
             * eventually be sent back to the frontend.
             */
            results.push({

                input:
                    stop.name,

                coordinates:
                    coordinates,

                routingStop:
                    routingStop,

                physicalStops:
                    physicalStops,

                routes:
                    routes,

                // Internal KD-tree distance.
                // This is NOT walking distance.
                kdDistance:
                    kdDistance
            });
        }


        // --------------------------------
        // DIRECT ROUTE TESTING
        // --------------------------------

        /*
         * For now, direct routing uses the first two
         * locations entered by the user:
         *
         * results[0] = origin
         * results[1] = destination
         */

        let directRoutes = [];

        let directTrips = [];


        console.log(
            "Processed results length:",
            results.length
        );


        /*
         * We need at least two locations before trying
         * to calculate a transit route.
         */
        if (results.length >= 2) {

            const originStop =
                results[0].routingStop;


            const destinationStop =
                results[1].routingStop;


            // --------------------------------
            // TEMPORARY DEBUGGING
            // --------------------------------

            console.log(
                "Origin:",
                originStop.name
            );


            console.log(
                "Origin stop IDs:",
                originStop.stopIds
            );


            console.log(
                "Origin route IDs:",
                originStop.routes.map(
                    route =>
                        route.routeId
                )
            );


            console.log(
                "Destination:",
                destinationStop.name
            );


            console.log(
                "Destination stop IDs:",
                destinationStop.stopIds
            );


            console.log(
                "Destination route IDs:",
                destinationStop.routes.map(
                    route =>
                        route.routeId
                )
            );


            /*
             * findDirectRoutes only needs the routes
             * property, so it can already work with our
             * new routingStop object.
             */
            directRoutes =
                findDirectRoutes(
                    originStop,
                    destinationStop
                );


            console.log(
                "Direct routes result:",
                directRoutes
            );


            /*
 * Find actual scheduled trips on the
 * shared direct routes.
 *
 * findDirectTrips now supports multiple
 * physical stop IDs for each location.
 */
directTrips =
    findDirectTrips(
        directRoutes,
        originStop,
        destinationStop,
        tripsByRoute,
        stopTimesByTrip,
        serviceByDate,
        travelDate,
        departureTime
    );

console.log(
    "Direct trips result:",
    directTrips
);
console.log("Date:",travelDate)
        }


        /*
         * Send the processed route information back
         * to the frontend / user's browser.
         */
        res.json({

            success: true,

            departureTime:
                departureTime,

            stops:
                results,

            directRoutes:
                directRoutes,

            directTrips:
                directTrips
        });


    } catch (error) {

        console.error(
            "Error processing route:",
            error
        );


        res.status(500).json({

            success: false,

            error:
                "Failed to process route"
        });
    }
});


app.listen(
    PORT,
    () => { //starts web server at port and listens for traffic

        console.log(
            `Server running on http://localhost:${PORT}`
        );
    }
);