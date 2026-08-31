const {
    getGoogleWalkingRoute
} = require("./getGoogleWalkingRoute");
const {
    secondsToGtfsTime
} = require("../graph/gtfsTime");


/* ORS filters in bulk; Google verifies only the best scheduled finalists. */
async function verifyTransferConnections({
    connections,
    stopById,
    maximumConnectionsToVerify = 5,
    maximumWalkingSeconds = 600,
    maximumWalkingMetres = 600,
    minimumBoardingBufferSeconds = 300,
    originLocation = null,
    destinationLocation = null,
    requestedDepartureTimeSeconds = null,
    apiKey,
    fetchImpl
}) {
    const finalists = connections.slice(0, maximumConnectionsToVerify);
    const verified = [];

    for (const connection of finalists) {
        const fromStop = stopById.get(String(connection.transfer.fromStopId));
        const toStop = stopById.get(String(connection.transfer.toStopId));

        if (!fromStop || !toStop) continue;

        let accessWalk = null;

        if (originLocation) {
            const boardingStop = stopById.get(
                String(connection.firstTrip.originBoardingStopId)
            );

            if (!boardingStop) continue;

            accessWalk = await getGoogleWalkingRoute({
                origin: originLocation,
                destination: boardingStop,
                apiKey,
                fetchImpl
            });

            if (
                accessWalk.durationSeconds > maximumWalkingSeconds ||
                accessWalk.distanceMetres > maximumWalkingMetres ||
                (Number.isFinite(requestedDepartureTimeSeconds) &&
                    requestedDepartureTimeSeconds + accessWalk.durationSeconds >
                        connection.firstTrip.originDepartureTimeSeconds)
            ) continue;
        }

        const walking = await getGoogleWalkingRoute({
            origin: fromStop,
            destination: toStop,
            apiKey,
            fetchImpl
        });

        if (
            walking.durationSeconds > maximumWalkingSeconds ||
            walking.distanceMetres > maximumWalkingMetres
        ) continue;

        const earliestBoarding =
            connection.firstTrip.firstArrivalTimeSeconds +
            walking.durationSeconds +
            minimumBoardingBufferSeconds;

        if (connection.secondTrip.secondDepartureTimeSeconds < earliestBoarding) {
            continue;
        }

        let finalWalk = null;

        if (destinationLocation) {
            const destinationStop = stopById.get(
                String(connection.secondTrip.destinationStopId)
            );

            if (!destinationStop) continue;

            finalWalk = await getGoogleWalkingRoute({
                origin: destinationStop,
                destination: destinationLocation,
                apiKey,
                fetchImpl
            });

            if (
                finalWalk.durationSeconds > maximumWalkingSeconds ||
                finalWalk.distanceMetres > maximumWalkingMetres
            ) continue;
        }

        verified.push({
            ...connection,
            accessWalk: accessWalk && {
                walkingSeconds: accessWalk.durationSeconds,
                walkingMetres: accessWalk.distanceMetres,
                encodedPolyline: accessWalk.encodedPolyline,
                source: "google_routes"
            },
            transfer: {
                ...connection.transfer,
                walkingSeconds: walking.durationSeconds,
                walkingMetres: walking.distanceMetres,
                encodedPolyline: walking.encodedPolyline,
                source: "google_routes"
            },
            transferWaitSeconds:
                connection.secondTrip.secondDepartureTimeSeconds -
                (connection.firstTrip.firstArrivalTimeSeconds +
                    walking.durationSeconds),
            finalWalk: finalWalk && {
                walkingSeconds: finalWalk.durationSeconds,
                walkingMetres: finalWalk.distanceMetres,
                encodedPolyline: finalWalk.encodedPolyline,
                source: "google_routes"
            },
            destinationWalkingMetres: finalWalk?.distanceMetres || 0,
            destinationWalkingSeconds: finalWalk?.durationSeconds || 0,
            arrivalAtDestinationSeconds:
                connection.finalArrivalTimeSeconds +
                (finalWalk?.durationSeconds || 0),
            arrivalAtDestination: secondsToGtfsTime(
                connection.finalArrivalTimeSeconds +
                (finalWalk?.durationSeconds || 0)
            ),
            googleVerification: "verified"
        });
    }

    verified.sort((first, second) =>
        first.destinationWalkingMetres - second.destinationWalkingMetres ||
        first.transfer.walkingSeconds - second.transfer.walkingSeconds
    );

    return verified;
}


module.exports = verifyTransferConnections;
