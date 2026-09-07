const buildDirectionalTransferCandidates =
    require("./buildDirectionalTransferCandidates");
const filterTransferCandidatesWithOrs =
    require("../ors/filterTransferCandidatesWithOrs");
const buildScheduledTransferConnections =
    require("./buildScheduledTransferConnections");
const verifyTransferConnections =
    require("../google/verifyTransferConnections");
const {
    distanceMetres
} = require("../../spatial/nearestStop");


/* Runs the complete KD-tree -> ORS -> schedule -> Google pipeline. */
async function findDirectionalTransferConnections({
    originStopIds,
    destinationStopIds,
    travelDate,
    departureTimeSeconds,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    orsApiKey,
    orsMatrixUrl,
    googleRoutesApiKey,
    maximumWalkingSeconds = 600,
    maximumWalkingMetres = 600,
    minimumBoardingBufferSeconds = 300,
    maximumConnectionsToVerify = 5,
    originLocation = null,
    destinationLocation = null,
    destinationDistanceByStopId = new Map(),
    fetchImpl
}) {
    const directional = buildDirectionalTransferCandidates({
        originStopIds,
        destinationStopIds,
        travelDate,
        departureTimeSeconds,
        stopById,
        tripsByRoute,
        stopTimesByTrip,
        serviceByDate
    });

    if (directional.candidates.length === 0) {
        return emptyResult(directional.statistics, "no_spatial_candidates");
    }

    const ors = await filterTransferCandidatesWithOrs({
        candidates: directional.candidates,
        maximumWalkingSeconds,
        maximumWalkingMetres,
        apiKey: orsApiKey,
        matrixUrl: orsMatrixUrl,
        fetchImpl
    });

    const scheduled = buildScheduledTransferConnections({
        candidates: ors.candidates,
        minimumBoardingBufferSeconds
    });

    scheduled.sort((first, second) => {
        const firstDistance = destinationDistanceByStopId.get(
            String(first.secondTrip.destinationStopId)
        ) ?? Infinity;
        const secondDistance = destinationDistanceByStopId.get(
            String(second.secondTrip.destinationStopId)
        ) ?? Infinity;
        const firstProgressDistance = distanceFromTransferToDestination(
            first,
            destinationLocation,
            stopById
        );
        const secondProgressDistance = distanceFromTransferToDestination(
            second,
            destinationLocation,
            stopById
        );

        /* First preserve the closest destination-area stop. Then prefer a
         * valid transfer location geographically closer to the real
         * destination. This prevents an earlier bus travelling away from the
         * destination (for example 518 toward Century Park) from winning. */
        return firstDistance - secondDistance ||
            firstProgressDistance - secondProgressDistance ||
            first.firstTrip.firstArrivalTimeSeconds -
                second.firstTrip.firstArrivalTimeSeconds ||
            first.transfer.walkingSeconds - second.transfer.walkingSeconds ||
            first.finalArrivalTimeSeconds - second.finalArrivalTimeSeconds;
    });

    const finalistConnections =
        verifyTransferConnections.groupDistinctTransferPairs(
            scheduled,
            maximumConnectionsToVerify
        ).map(group => ({
            ...group.connections[0],
            scheduleOptionsForStopPair: group.connections.length
        }));

    if (scheduled.length === 0) {
        return {
            ...emptyResult(directional.statistics, "no_catchable_connection"),
            counts: makeCounts(directional.candidates.length,
                ors.candidates.length, 0, 0, 0),
            finalistConnections: [],
            orsRejected: ors.rejected
        };
    }

    const verified = await verifyTransferConnections({
        connections: scheduled,
        stopById,
        maximumConnectionsToVerify,
        maximumWalkingSeconds,
        maximumWalkingMetres,
        minimumBoardingBufferSeconds,
        originLocation,
        destinationLocation,
        requestedDepartureTimeSeconds: departureTimeSeconds,
        apiKey: googleRoutesApiKey,
        fetchImpl
    });

    return {
        success: verified.length > 0,
        reason: verified.length ? null : "google_rejected_finalists",
        bestConnection: verified[0] || null,
        finalistConnections,
        verifiedConnections: verified,
        counts: makeCounts(
            directional.candidates.length,
            ors.candidates.length,
            scheduled.length,
            Math.min(scheduled.length, maximumConnectionsToVerify),
            verified.length
        ),
        statistics: directional.statistics,
        orsRejected: ors.rejected
    };
}


function distanceFromTransferToDestination(
    connection,
    destinationLocation,
    stopById
) {
    const transferStop = stopById.get(
        String(connection.secondTrip.secondBoardingStopId)
    );
    const destinationStop = stopById.get(
        String(connection.secondTrip.destinationStopId)
    );
    const destination = destinationLocation || destinationStop;

    if (!transferStop || !destination) return Infinity;

    return distanceMetres(
        Number(transferStop.lat),
        Number(transferStop.lon),
        Number(destination.lat),
        Number(destination.lon)
    );
}


function makeCounts(spatial, ors, scheduled, finalists, verified) {
    return {
        spatialCandidates: spatial,
        orsAccepted: ors,
        scheduledConnections: scheduled,
        googleFinalists: finalists,
        googleVerified: verified
    };
}


function emptyResult(statistics, reason) {
    return {
        success: false,
        reason,
        bestConnection: null,
        finalistConnections: [],
        verifiedConnections: [],
        counts: makeCounts(0, 0, 0, 0, 0),
        statistics
    };
}


module.exports = findDirectionalTransferConnections;
