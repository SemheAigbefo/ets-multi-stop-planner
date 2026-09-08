const {
    planGraphJourney,
    verifyWalkingItinerary,
    WalkingVerificationError
} = require("./graph");


function classifyJourney(journey) {
    if (journey.boardings === 0) return "walk";
    if (journey.boardings === 1) return "direct";
    return "transfer";
}


/* Plans one adjacent multi-stop leg with the graph routing engine. */
async function planLeg({
    originStop,
    destinationStop,
    travelDate,
    departureTime,
    kdTree,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    minimumTransferMinutes = 5,
    walkingOptions = {},
    transitOptions = {},
    searchOptions = {},
    verifyWalking = false,
    googleRoutesApiKey,
    fetchImpl
}) {
    const graphJourney = planGraphJourney({
        originStopIds: originStop.stopIds,
        destinationStopIds: destinationStop.stopIds,
        originLocation:
            originStop.isExactStop === false
                ? originStop.coordinates
                : null,
        destinationLocation:
            destinationStop.isExactStop === false
                ? destinationStop.coordinates
                : null,
        travelDate,
        departureTime,
        kdTree,
        stopById,
        tripsByRoute,
        stopTimesByTrip,
        serviceByDate,
        walking: walkingOptions,
        transit: {
            minimumTransferSeconds: minimumTransferMinutes * 60,
            ...transitOptions
        },
        ...searchOptions
    });

    if (!graphJourney.success) {
        return failureResult(
            originStop,
            destinationStop,
            departureTime,
            graphJourney,
            graphJourney.reason
        );
    }

    let finalJourney = graphJourney;

    try {
        if (verifyWalking) {
            finalJourney = await verifyWalkingItinerary({
                journey: graphJourney,
                stopById,
                apiKey: googleRoutesApiKey,
                fetchImpl,
                minimumTransferSeconds: minimumTransferMinutes * 60,
                maximumSegmentMetres:
                    walkingOptions.maximumSegmentMetres ?? 600
            });
        } else {
            finalJourney = {
                ...graphJourney,
                walkingVerification: {
                    verified: false,
                    segmentsVerified: 0,
                    reason: "disabled"
                }
            };
        }
    } catch (error) {
        if (!(error instanceof WalkingVerificationError)) {
            throw error;
        }

        return {
            ...failureResult(
                originStop,
                destinationStop,
                departureTime,
                graphJourney,
                error.code
            ),
            walkingVerificationError: {
                code: error.code,
                message: error.message,
                details: error.details
            }
        };
    }

    const {
        states: internalStates,
        actions: internalActions,
        ...publicJourney
    } = finalJourney;

    const bestItinerary = {
        type: classifyJourney(publicJourney),
        routingEngine: "time_dependent_graph",
        ...publicJourney
    };

    return {
        origin: originStop.name,
        destination: destinationStop.name,
        requestedDepartureTime: departureTime,
        routingEngine: "time_dependent_graph",
        graphJourney: publicJourney,
        bestItinerary,
        failureReason: null,
        directRoutes: [],
        directTrips: [],
        transferOptions: [],
        transferTrips: []
    };
}


function failureResult(
    originStop,
    destinationStop,
    departureTime,
    graphJourney,
    failureReason
) {
    return {
        origin: originStop.name,
        destination: destinationStop.name,
        requestedDepartureTime: departureTime,
        routingEngine: "time_dependent_graph",
        graphJourney,
        bestItinerary: null,
        failureReason,
        directRoutes: [],
        directTrips: [],
        transferOptions: [],
        transferTrips: []
    };
}


module.exports = planLeg;
