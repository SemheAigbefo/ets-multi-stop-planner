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
    /* A stop pair can have hundreds of schedule combinations. Verify distinct
     * physical transfer locations so one terminal cannot consume every Google
     * finalist slot with duplicate trips over the same walk. */
    const finalistGroups = groupDistinctTransferPairs(
        connections,
        maximumConnectionsToVerify
    );
    const verified = [];

    for (const group of finalistGroups) {
        const representative = group.connections[0];
        const fromStop = stopById.get(
            String(representative.transfer.fromStopId)
        );
        const toStop = stopById.get(
            String(representative.transfer.toStopId)
        );

        if (!fromStop || !toStop) continue;

        let accessWalk = null;

        if (originLocation) {
            const boardingStop = stopById.get(
                String(representative.firstTrip.originBoardingStopId)
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
                accessWalk.distanceMetres > maximumWalkingMetres
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

        const connection = group.connections.find(candidate => {
            const catchesFirstBus =
                !Number.isFinite(requestedDepartureTimeSeconds) ||
                requestedDepartureTimeSeconds +
                    (accessWalk?.durationSeconds || 0) <=
                    candidate.firstTrip.originDepartureTimeSeconds;
            const earliestSecondBus =
                candidate.firstTrip.firstArrivalTimeSeconds +
                walking.durationSeconds +
                minimumBoardingBufferSeconds;

            return catchesFirstBus &&
                candidate.secondTrip.secondDepartureTimeSeconds >=
                    earliestSecondBus;
        });

        if (!connection) continue;

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

    return rankVerifiedConnections(verified);
}


/* A few metres of final walking must not justify a large transit detour.
 * Stops within 100 m of the shortest final walk are treated as equivalently
 * close; schedule arrival and transfer walking then break the tie. */
function rankVerifiedConnections(connections) {
    if (connections.length < 2) return connections;

    const closestFinalWalk = Math.min(
        ...connections.map(item => item.destinationWalkingMetres)
    );
    const closeEnoughLimit = closestFinalWalk + 100;

    return [...connections].sort((first, second) => {
        const firstIsClose =
            first.destinationWalkingMetres <= closeEnoughLimit;
        const secondIsClose =
            second.destinationWalkingMetres <= closeEnoughLimit;

        if (firstIsClose !== secondIsClose) {
            return firstIsClose ? -1 : 1;
        }

        if (firstIsClose) {
            return first.arrivalAtDestinationSeconds -
                    second.arrivalAtDestinationSeconds ||
                first.destinationWalkingMetres -
                    second.destinationWalkingMetres ||
                first.transfer.walkingSeconds -
                    second.transfer.walkingSeconds;
        }

        return first.destinationWalkingMetres -
                second.destinationWalkingMetres ||
            first.arrivalAtDestinationSeconds -
                second.arrivalAtDestinationSeconds;
    });
}


function groupDistinctTransferPairs(connections, limit) {
    const groups = [];
    const groupByKey = new Map();

    for (const connection of connections) {
        const pairKey = [
            connection.transfer.fromStopId,
            connection.transfer.toStopId
        ].map(String).join("|");

        let group = groupByKey.get(pairKey);

        if (!group) {
            if (groups.length >= limit) continue;

            group = { pairKey, connections: [] };
            groupByKey.set(pairKey, group);
            groups.push(group);
        }

        group.connections.push(connection);
    }

    return groups;
}


module.exports = verifyTransferConnections;
module.exports.groupDistinctTransferPairs = groupDistinctTransferPairs;
module.exports.rankVerifiedConnections = rankVerifiedConnections;
