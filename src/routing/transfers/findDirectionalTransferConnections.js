const buildDirectionalTransferCandidates =
    require("./buildDirectionalTransferCandidates");
const filterTransferCandidatesWithOrs =
    require("../ors/filterTransferCandidatesWithOrs");
const buildScheduledTransferConnections =
    require("./buildScheduledTransferConnections");
const verifyTransferConnections =
    require("../google/verifyTransferConnections");


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

        return firstDistance - secondDistance ||
            first.transfer.walkingSeconds - second.transfer.walkingSeconds;
    });

    if (scheduled.length === 0) {
        return {
            ...emptyResult(directional.statistics, "no_catchable_connection"),
            counts: makeCounts(directional.candidates.length,
                ors.candidates.length, 0, 0, 0),
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
        verifiedConnections: [],
        counts: makeCounts(0, 0, 0, 0, 0),
        statistics
    };
}


module.exports = findDirectionalTransferConnections;
