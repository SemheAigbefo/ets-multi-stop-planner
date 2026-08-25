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

    if (!activeServices) {
        return results;
    }


    const requestedDeparture =
        timeToSeconds(departureTime);


    const originStopIds =
        new Set(originStop.stopIds);

    const destinationStopIds =
        new Set(destinationStop.stopIds);


    for (const route of directRoutes) {

        const trips =
            tripsByRoute.get(route.routeId) || [];

        for (const trip of trips) {


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

            const stopTimes =
                stopTimesByTrip.get(
                    trip.tripId
                );

            if (!stopTimes) {
                continue;
            }

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


    results.sort(
        (a, b) =>
            timeToSeconds(a.departureTime) -
            timeToSeconds(b.departureTime)
    );


    return results;
}


module.exports =
    findDirectTrips;
