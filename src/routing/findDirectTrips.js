/*
 * Converts a GTFS time into seconds.
 *
 * Example:
 * 14:30:00
 *
 * 14 hours * 3600
 * 30 minutes * 60
 *
 * = 52200 seconds
 *
 * GTFS can also contain times greater than 24:00:00,
 * so using our own conversion is useful here.
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
 * Finds actual scheduled trips that travel
 * from the origin location to the destination location.
 *
 * A logical location may contain multiple physical
 * GTFS stop IDs / bays.
 */
function findDirectTrips(
    directRoutes,
    originStop,
    destinationStop,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    date,
    departureTime
) {

    const results = [];

    const activeServices =
        serviceByDate.get(date);

    console.log(
        "Active services for date:",
        activeServices?.size
    );

    if (!activeServices) {
        console.log("No active services found.");
        return results;
    }


    const requestedDeparture =
        timeToSeconds(departureTime);


    const originStopIds =
        new Set(originStop.stopIds);

    const destinationStopIds =
        new Set(destinationStop.stopIds);


    console.log(
        "Origin stop IDs:",
        [...originStopIds]
    );

    console.log(
        "Destination stop IDs:",
        [...destinationStopIds]
    );


    let totalTrips = 0;
    let activeServiceTrips = 0;
    let tripsWithStopTimes = 0;
    let tripsWithOrigin = 0;
    let tripsWithDestination = 0;
    let correctDirection = 0;
    let afterDepartureTime = 0;


    for (const route of directRoutes) {

        const trips =
            tripsByRoute.get(route.routeId) || [];

        console.log(
            `Route ${route.routeId} has ${trips.length} trips`
        );


        for (const trip of trips) {

            totalTrips++;


            /*
             * Check whether this trip operates
             * on the requested date.
             */
            if (
                !activeServices.has(
                    trip.serviceId
                )
            ) {
                continue;
            }

            activeServiceTrips++;


            const stopTimes =
                stopTimesByTrip.get(
                    trip.tripId
                );

            if (!stopTimes) {
                continue;
            }

            tripsWithStopTimes++;


            const originMatches =
                stopTimes.filter(
                    stopTime =>
                        originStopIds.has(
                            stopTime.stopId
                        )
                );


            if (originMatches.length === 0) {
                continue;
            }

            tripsWithOrigin++;


            const destinationMatches =
                stopTimes.filter(
                    stopTime =>
                        destinationStopIds.has(
                            stopTime.stopId
                        )
                );


            if (destinationMatches.length === 0) {
                continue;
            }

            tripsWithDestination++;


            let validOrigin = null;
            let validDestination = null;


            for (const originTime of originMatches) {

                for (
                    const destinationTime
                    of destinationMatches
                ) {

                    if (
                        originTime.stopSequence <
                        destinationTime.stopSequence
                    ) {

                        validOrigin =
                            originTime;

                        validDestination =
                            destinationTime;

                        break;
                    }
                }

                if (validOrigin) {
                    break;
                }
            }


            if (!validOrigin) {
                continue;
            }

            correctDirection++;


            const tripDeparture =
                timeToSeconds(
                    validOrigin.departureTime
                );


            if (
                tripDeparture <
                requestedDeparture
            ) {
                continue;
            }

            afterDepartureTime++;


            results.push({

                routeId:
                    route.routeId,

                tripId:
                    trip.tripId,

                headsign:
                    trip.headsign,

                originStopId:
                    validOrigin.stopId,

                destinationStopId:
                    validDestination.stopId,

                departureTime:
                    validOrigin.departureTime,

                arrivalTime:
                    validDestination.arrivalTime
            });
        }
    }


    console.log("----- DIRECT TRIP DEBUG -----");

    console.log(
        "Total trips checked:",
        totalTrips
    );

    console.log(
        "Active-service trips:",
        activeServiceTrips
    );

    console.log(
        "Trips with stopTimes:",
        tripsWithStopTimes
    );

    console.log(
        "Trips containing origin:",
        tripsWithOrigin
    );

    console.log(
        "Trips containing destination:",
        tripsWithDestination
    );

    console.log(
        "Trips in correct direction:",
        correctDirection
    );

    console.log(
        "Trips after departure time:",
        afterDepartureTime
    );

    console.log("-----------------------------");


    results.sort(
        (a, b) =>
            timeToSeconds(a.departureTime) -
            timeToSeconds(b.departureTime)
    );


    return results;
}


module.exports =
    findDirectTrips;