require("dotenv").config();
const appConfig = require("./src/config/appConfig");

const express = require("express"); //imports Express library
const cors = require("cors"); //imports cors
const registerRealtimeRoutes = require("./src/api/registerRealtimeRoutes");
const registerShapeRoutes = require("./src/api/registerShapeRoutes");

const stopsData =
    require("./data/processed/stopsRouteJoin.json"); //imports processed ETS stop data

const buildIndexes =
    require("./src/data/buildIndexes"); //imports function that builds stopMap and KD-tree

const getCoordinates =
    require("./src/geocode/coordFun"); //imports geocoding function

const selectEndpointStops =
    require("./src/spatial/selectEndpointStops");

const getRoutesByStop =
    require("./src/routes/getRouteByStop");

const planMultiStopTrip =
    require("./src/routing/planMultiStopTrip");

const {
    identifyTransitCentres
} = require("./src/routing/transitCentres/identifyTransitCentres");
const buildTransitCentreGraph =
    require("./src/routing/transitCentres/buildTransitCentreGraph");
const {
    createWalkingRouteCache
} = require("./src/routing/cache/createWalkingRouteCache");

const app = express(); //instance of Express application

const PORT = appConfig.server.port;


// Allow Express to read JSON sent by fetch()
app.use(cors());

app.use(express.json()); //middleware that tells Exp serv to read and parse incoming data

/* Serve the browser app from the same origin as the API. This lets phones use
 * the computer's LAN address without any hardcoded localhost URLs. */
app.use(express.static(__dirname));

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
    stopById,
    kdTree,
    tripsByRoute,
    tripById,
    shapePointsById,
    stopTimesByTrip,
    serviceByDate
} = buildIndexes(stopsData);

registerRealtimeRoutes({ app, config: appConfig.realtime });
registerShapeRoutes({ app, tripById, shapePointsById, stopById });

/* This smaller graph is static for the loaded GTFS feed, so build it once. */
const {
    centresById,
    centreByStopId
} = identifyTransitCentres(stopById);
const transitCentreGraph = buildTransitCentreGraph({
    centresById,
    centreByStopId,
    tripsByRoute,
    stopTimesByTrip
});
const walkingRouteCache = createWalkingRouteCache();


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


/* Prints the actual journey a rider would follow, without internal search data. */
function printRecommendedJourney(multiStopTrip) {
    if (!multiStopTrip?.legs?.length) return;

    console.log("\nRECOMMENDED JOURNEY");

    for (const leg of multiStopTrip.legs) {
        console.log(
            `\nLeg ${leg.legNumber}: ${leg.origin} -> ${leg.destination}`
        );
        console.log(
            `Leave ${leg.actualDepartureTime}; arrive ${leg.arrivalTime}`
        );

        printPhase1Finalists(leg);

        const actions = leg.itinerary?.itinerary || [];

        console.table(actions.map((action, index) => {
            const fromStop = stopById.get(String(action.fromStopId));
            const toStop = stopById.get(String(action.toStopId));

            if (action.type === "transit") {
                return {
                    step: index + 1,
                    instruction:
                        `Take ${action.transitMode || "bus"} ${action.routeId}` +
                        (action.headsign
                            ? ` toward ${action.headsign}`
                            : ""),
                    from: fromStop?.name || action.fromStopId,
                    to: toStop?.name || action.toStopId,
                    depart: action.departureTime,
                    arrive: action.arrivalTime,
                    duration: ""
                };
            }

            return {
                step: index + 1,
                instruction: "Walk",
                from:
                    fromStop?.name ||
                    action.fromName ||
                    (action.fromLocation ? leg.origin : action.fromStopId),
                to:
                    toStop?.name ||
                    action.toName ||
                    (action.toLocation ? leg.destination : action.toStopId),
                depart: "",
                arrive: "",
                duration:
                    (Number.isFinite(action.durationMinutes)
                        ? `${action.durationMinutes} min`
                        : Number.isFinite(action.durationSeconds)
                            ? `${Math.ceil(action.durationSeconds / 60)} min`
                            : "Walking time unavailable") +
                    (Number.isFinite(action.distanceMetres)
                        ? `, ${Math.round(action.distanceMetres)} m`
                        : "")
            };
        }));
    }

    console.log("Journey result:", {
        success: multiStopTrip.success,
        journeyType: multiStopTrip.journeyType,
        finalArrivalTime: multiStopTrip.finalArrivalTime || null
    });
}


function printPhase1Finalists(leg) {
    const phase1 = leg.routingDetails?.hierarchical?.phase1;
    const finalists = phase1?.finalistConnections || [];

    if (finalists.length === 0) return;

    const verifiedByPair = new Map(
        (phase1.verifiedConnections || []).map(connection => [
            transferPairKey(connection),
            connection
        ])
    );
    const selectedPair = phase1.bestConnection
        ? transferPairKey(phase1.bestConnection)
        : null;

    console.log("\nPHASE 1 FINALISTS");
    console.table(finalists.slice(0, 5).map((scheduled, index) => {
        const pairKey = transferPairKey(scheduled);
        const verified = verifiedByPair.get(pairKey);
        const displayed = verified || scheduled;
        const exitStop = stopById.get(
            String(displayed.transfer.fromStopId)
        );
        const boardingStop = stopById.get(
            String(displayed.transfer.toStopId)
        );
        const destinationStop = stopById.get(
            String(displayed.secondTrip.destinationStopId)
        );

        return {
            rank: index + 1,
            selected: pairKey === selectedPair ? "YES" : "",
            google: verified ? "verified" : "rejected",
            firstBus:
                `${displayed.firstTrip.routeId} ` +
                `${displayed.firstTrip.headsign || ""}`.trim(),
            firstDeparture:
                displayed.firstTrip.originDepartureTime,
            exitStop:
                exitStop?.name || displayed.transfer.fromStopId,
            transferWalk:
                `${Math.ceil(displayed.transfer.walkingSeconds / 60)} min, ` +
                `${Math.round(displayed.transfer.walkingMetres)} m`,
            secondStop:
                boardingStop?.name || displayed.transfer.toStopId,
            secondBus:
                `${displayed.secondTrip.routeId} ` +
                `${displayed.secondTrip.headsign || ""}`.trim(),
            secondDeparture:
                displayed.secondTrip.secondDepartureTime,
            destinationStop:
                destinationStop?.name ||
                displayed.secondTrip.destinationStopId,
            finalArrival:
                displayed.arrivalAtDestination ||
                displayed.finalArrivalTime,
            schedulesForPair:
                scheduled.scheduleOptionsForStopPair
        };
    }));
}


function transferPairKey(connection) {
    return [
        connection.transfer.fromStopId,
        connection.transfer.toStopId
    ].map(String).join("|");
}


/* Prints only the useful output from the new transfer-recovery pipeline. */
function printDirectionalTransferRecovery(recovery) {
    if (!recovery) return;

    if (recovery.phase === "phase_2") {
        if (!recovery.success || !recovery.verifiedJourney) {
            console.log("Phase 2 result:", {
                reason: recovery.reason,
                details:
                    recovery.phase2?.verifiedJourney?.details || null,
                centres:
                    recovery.phase2?.centrePath?.centres || []
            });
            return;
        }

        console.log("\nPHASE 2 TRANSIT-CENTRE JOURNEY");
        console.log(
            "Centres:",
            recovery.phase2.centrePath.centres.join(" -> ")
        );
        console.table(
            recovery.verifiedJourney.actions.map((action, index) => {
                const fromStop = stopById.get(String(action.fromStopId));
                const toStop = stopById.get(String(action.toStopId));

                if (action.type === "transit") {
                    return {
                        step: index + 1,
                        instruction:
                            `Take bus ${action.routeId}` +
                            (action.headsign
                                ? ` toward ${action.headsign}`
                                : ""),
                        from: fromStop?.name || action.fromStopId,
                        to: toStop?.name || action.toStopId,
                        depart: action.departureTime,
                        arrive: action.arrivalTime,
                        details: `trip ${action.tripId}`
                    };
                }

                return {
                    step: index + 1,
                    instruction: "Walk",
                    from: fromStop?.name || action.fromStopId || "Origin",
                    to: toStop?.name || action.toStopId || "Destination",
                    depart: "",
                    arrive: "",
                    details:
                        `${Math.ceil(action.durationSeconds / 60)} min, ` +
                        `${Math.round(action.distanceMetres)} m`
                };
            })
        );
        console.log("Final arrival:", recovery.finalArrivalTime);
        return;
    }

    if (recovery.phase === "phase_1") {
        recovery = recovery.phase1;
    }

    console.log("Transfer recovery candidates:", recovery.counts);

    if (!recovery.success || !recovery.bestConnection) {
        console.log("Transfer recovery result:", recovery.reason);
        return;
    }

    const connection = recovery.bestConnection;
    const first = connection.firstTrip;
    const transfer = connection.transfer;
    const second = connection.secondTrip;
    const firstBoardingStop = stopById.get(
        String(first.originBoardingStopId)
    );
    const firstExitStop = stopById.get(String(transfer.fromStopId));
    const secondBoardingStop = stopById.get(String(transfer.toStopId));
    const destinationStop = stopById.get(
        String(second.destinationStopId)
    );

    const steps = [
        {
            step: 1,
            type: "BUS",
            route: first.routeId,
            headsign: first.headsign || "",
            from: firstBoardingStop?.name || first.originBoardingStopId,
            to: firstExitStop?.name || transfer.fromStopId,
            depart: first.originDepartureTime,
            arrive: first.firstArrivalTime,
            details: `trip ${first.tripId}`
        },
        {
            step: 2,
            type: "WALK",
            route: "",
            headsign: "",
            from: firstExitStop?.name || transfer.fromStopId,
            to: secondBoardingStop?.name || transfer.toStopId,
            depart: "",
            arrive: "",
            details:
                `${Math.ceil(transfer.walkingSeconds / 60)} min, ` +
                `${Math.round(transfer.walkingMetres)} m (Google verified)`
        },
        {
            step: 3,
            type: "BUS",
            route: second.routeId,
            headsign: second.headsign || "",
            from: secondBoardingStop?.name || transfer.toStopId,
            to: destinationStop?.name || second.destinationStopId,
            depart: second.secondDepartureTime,
            arrive: second.destinationArrivalTime,
            details: `trip ${second.tripId}`
        }
    ];

    if (connection.accessWalk) {
        steps.unshift({
            step: 0,
            type: "WALK",
            route: "",
            headsign: "",
            from: "Origin",
            to: firstBoardingStop?.name || first.originBoardingStopId,
            depart: "",
            arrive: first.originDepartureTime,
            details:
                `${Math.ceil(connection.accessWalk.walkingSeconds / 60)} min, ` +
                `${Math.round(connection.accessWalk.walkingMetres)} m ` +
                "(Google verified)"
        });
    }

    if (connection.finalWalk) {
        steps.push({
            step: 4,
            type: "WALK",
            route: "",
            headsign: "",
            from: destinationStop?.name || second.destinationStopId,
            to: "Final destination",
            depart: second.destinationArrivalTime,
            arrive: connection.arrivalAtDestination,
            details:
                `${Math.ceil(connection.finalWalk.walkingSeconds / 60)} min, ` +
                `${Math.round(connection.finalWalk.walkingMetres)} m ` +
                "(Google verified)"
        });
    }

    steps.forEach((step, index) => {
        step.step = index + 1;
    });

    console.table(steps);

    console.log("Best recovered transfer:", {
        transferWaitMinutes:
            Math.floor(connection.transferWaitSeconds / 60),
        finalArrivalTime:
            connection.arrivalAtDestination || connection.finalArrivalTime,
        walkingVerifiedBy: transfer.source
    });
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
        preferredDepartureTimes = [],
        travelDate,
        departureDateTime,
        busesOnly = false
    } = req.body; //object destructuring; extract properties stops and departureTime from request

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

            let isExactStop;
            


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

                isExactStop = true;


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
                const endpointSelection =
                    selectEndpointStops({
                        kdTree,
                        lat: coordinates.lat,
                        lon: coordinates.lon,
                        radiusMetres: appConfig.endpoints.searchRadiusMetres,
                        maximumStops: appConfig.endpoints.maximumStops
                    });


                if (endpointSelection.stops.length === 0) {

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
                physicalStops = endpointSelection.stops;


                kdDistance =
                    endpointSelection.closestDistanceMetres;

                isExactStop = false;
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
                    physicalStops,

                coordinates,

                isExactStop
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

        let multiStopTrip = null;


        /*
         * We need at least two locations before trying
         * to calculate a transit route.
         */
        if (results.length >= 2) {

            const routeStops = results.map((result, index) => ({
                routingStop: result.routingStop,
                preferredDepartureTime:
                    preferredDepartureTimes[index] || null
            }));

            multiStopTrip =
                await planMultiStopTrip({
                    routeStops,
                    travelDate,
                    initialDepartureTime:
                        departureTime,
                    kdTree,
                    stopById,
                    tripsByRoute,
                    stopTimesByTrip,
                    serviceByDate,
                    walkingOptions: {
                        maximumSegmentMetres: appConfig.walking.maximumSegmentMetres,
                        maximumTotalWalkingMetres: appConfig.walking.maximumTotalMetres
                    },
                    minimumTransferMinutes: appConfig.transit.minimumTransferMinutes,
                    verifyWalking:
                        Boolean(
                            appConfig.services.googleRoutesApiKey
                        ),
                    googleRoutesApiKey:
                        appConfig.services.googleRoutesApiKey,
                    allowedRouteTypes:
                        busesOnly ? ["3"] : null,
                    hierarchicalOptions: {
                        maximumWalkingMetres: appConfig.walking.maximumSegmentMetres,
                        maximumBoardings: appConfig.transit.maximumBoardings,
                        maximumRaptorCandidatesToVerify:
                            appConfig.transit.maximumCandidates,
                        maximumRaptorWalkingRetries:
                            appConfig.transit.maximumWalkingRetries,
                        centreByStopId,
                        transitCentreGraph,
                        walkingRouteCache,
                        orsApiKey: appConfig.services.orsApiKey,
                        orsMatrixUrl: appConfig.services.orsMatrixUrl
                    }
                });

            console.log("Route search:", {
                success: multiStopTrip.success,
                legsCompleted: multiStopTrip.legs.length,
                failedLeg: multiStopTrip.failedLeg || null,
                finalArrivalTime:
                    multiStopTrip.finalArrivalTime ||
                    null
            });

            printRecommendedJourney(multiStopTrip);
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

            multiStopTrip:
                multiStopTrip,

            hierarchicalTransfer:
                multiStopTrip?.legs.map(
                    leg => leg.routingDetails.hierarchical || null
                ) || [],

            /*
             * Keep the first leg under the previous
             * response fields until the frontend is
             * migrated to multiStopTrip.legs.
             */
            leg:
                multiStopTrip?.legs[0]
                    ?.routingDetails || null,

            directRoutes:
                multiStopTrip?.legs[0]
                    ?.routingDetails.directRoutes || [],

            directTrips:
                multiStopTrip?.legs[0]
                    ?.routingDetails.directTrips || [],

            transferOptions:
                multiStopTrip?.legs[0]
                    ?.routingDetails.transferOptions || []
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


function startServer(
    port = PORT,
    host = appConfig.server.host
) {
    return app.listen(
        port,
        host,
        () => {
            console.log(
                `Server running on http://${host}:${port}`
            );
        }
    );
}


/* Start normally from `node server.js`, but allow HTTP integration tests to
 * import the Express app and choose an unused temporary port. */
if (require.main === module) {
    startServer();
}


module.exports = {
    app,
    startServer
};
