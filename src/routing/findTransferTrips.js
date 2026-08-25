const findDirectTrips =
    require("./findDirectTrips");

const selectBestDirectTrip =
    require("./selectBestDirectTrip");


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
 * Converts seconds back into a GTFS time.
 *
 * Hours are not limited to 23 because GTFS may use
 * values such as 25:10:00.
 */
function secondsToGtfsTime(totalSeconds) {
    const hours =
        Math.floor(totalSeconds / 3600);

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;

    return [
        hours,
        minutes,
        seconds
    ]
        .map(value =>
            String(value).padStart(2, "0")
        )
        .join(":");
}


/*
 * Validates one-transfer journeys against the schedule.
 *
 * For every structural transfer option:
 *
 * 1. Find actual trips from origin to transfer.
 * 2. Add time for the passenger to change buses.
 * 3. Find actual trips from transfer to destination.
 * 4. Keep journeys where both scheduled legs exist.
 */
function findTransferTrips(
    transferOptions,
    originStop,
    destinationStop,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    date,
    departureTime,
    minimumTransferMinutes = 5
) {
    const results = [];

    const transferBufferSeconds =
        minimumTransferMinutes * 60;


    for (const option of transferOptions) {
        /*
         * Validate Route A:
         *
         * origin → transfer stop
         */
        const firstLegTrips =
            findDirectTrips(
                [option.firstRoute],
                originStop,
                option.transferStop,
                tripsByRoute,
                stopTimesByTrip,
                serviceByDate,
                date,
                departureTime
            );


        for (const firstTrip of firstLegTrips) {
            /*
             * The second bus must leave after:
             *
             * first-bus arrival + transfer buffer
             */
            const earliestSecondDepartureSeconds =
                timeToSeconds(
                    firstTrip.arrivalTime
                ) +
                transferBufferSeconds;

            const earliestSecondDeparture =
                secondsToGtfsTime(
                    earliestSecondDepartureSeconds
                );


            /*
             * Validate Route B:
             *
             * transfer stop → destination
             */
            const secondLegTrips =
                findDirectTrips(
                    [option.secondRoute],
                    option.transferStop,
                    destinationStop,
                    tripsByRoute,
                    stopTimesByTrip,
                    serviceByDate,
                    date,
                    earliestSecondDeparture
                );


            /*
             * For this first trip, we only need the
             * second trip with the earliest arrival.
             */
            const bestSecondTrip =
                selectBestDirectTrip(
                    secondLegTrips
                );

            if (!bestSecondTrip) {
                continue;
            }


            const firstArrivalSeconds =
                timeToSeconds(
                    firstTrip.arrivalTime
                );

            const secondDepartureSeconds =
                timeToSeconds(
                    bestSecondTrip.departureTime
                );

            const finalArrivalSeconds =
                timeToSeconds(
                    bestSecondTrip.arrivalTime
                );

            const firstDepartureSeconds =
                timeToSeconds(
                    firstTrip.departureTime
                );


            results.push({
                transferStop:
                    option.transferStop,

                firstLeg:
                    firstTrip,

                secondLeg:
                    bestSecondTrip,

                transferWaitMinutes:
                    Math.round(
                        (
                            secondDepartureSeconds -
                            firstArrivalSeconds
                        ) / 60
                    ),

                totalTravelTimeMinutes:
                    Math.round(
                        (
                            finalArrivalSeconds -
                            firstDepartureSeconds
                        ) / 60
                    ),

                finalArrivalTime:
                    bestSecondTrip.arrivalTime
            });
        }
    }


    /*
     * Best transfer journeys appear first.
     */
    results.sort(
        (a, b) =>
            timeToSeconds(a.finalArrivalTime) -
            timeToSeconds(b.finalArrivalTime)
    );


    return results;
}


module.exports =
    findTransferTrips;