const findDirectionalTransferConnections =
    require("../transfers/findDirectionalTransferConnections");
const buildTransitCentreEndpoints =
    require("./buildTransitCentreEndpoints");
const {
    findTransitCentrePath
} = require("./findTransitCentrePath");
const verifyTransitCentreJourney =
    require("./verifyTransitCentreJourney");
const getTransferBufferSeconds =
    require("./getTransferBufferSeconds");
const planRaptorJourney =
    require("../raptor/planRaptorJourney");
const {
    verifyWalkingItinerary,
    WalkingVerificationError
} = require("../google/verifyWalkingItinerary");


/* Phase 1 is complete on its own. Phase 2 runs only when Phase 1 fails. */
async function planHierarchicalTransfer(options) {
    let phase1;

    try {
        phase1 = await findDirectionalTransferConnections(options);
    } catch (error) {
        if (!isRecoverableOrsError(error)) throw error;

        phase1 = {
            success: false,
            reason: "ors_unavailable",
            error: error.message,
            bestConnection: null,
            finalistConnections: [],
            verifiedConnections: [],
            counts: {
                spatialCandidates: 0,
                orsAccepted: 0,
                scheduledConnections: 0,
                googleFinalists: 0,
                googleVerified: 0
            }
        };
    }

    if (phase1.success) {
        return {
            success: true,
            phase: "phase_1",
            reason: null,
            phase1,
            phase2: null,
            bestConnection: phase1.bestConnection,
            verifiedJourney: null,
            finalArrivalTime:
                phase1.bestConnection.arrivalAtDestination ||
                phase1.bestConnection.finalArrivalTime
        };
    }

    let raptorJourney = null;
    let verifiedJourney = null;
    const verificationFailures = [];
    const rejectedWalkingEdges = new Set();
    const originWalkOverridesByStopId = new Map();
    const maximumRetries = options.maximumRaptorWalkingRetries ?? 3;

    for (let attempt = 0; attempt <= maximumRetries && !verifiedJourney; attempt++) {
        raptorJourney = runRaptor(options, originWalkOverridesByStopId);
        if (!raptorJourney.success) break;

        const candidates = (raptorJourney.candidateJourneys || [raptorJourney])
            .slice(0, options.maximumRaptorCandidatesToVerify ?? 10);
        let shouldRetryWithVerifiedOriginWalk = false;

        for (const candidate of candidates) {
            if (candidate.itinerary.some(action =>
                action.type === "walk" &&
                rejectedWalkingEdges.has(walkingEdgeKey(action))
            )) continue;

            try {
                verifiedJourney = await verifyWalkingItinerary({
                    journey: candidate,
                    stopById: options.stopById,
                    apiKey: options.googleRoutesApiKey,
                    fetchImpl: options.fetchImpl,
                    minimumTransferSeconds:
                        options.minimumTransferSeconds ?? 300,
                    maximumSegmentMetres:
                        options.maximumWalkingMetres ?? 600
                });
                verifiedJourney.actions = verifiedJourney.itinerary;
                break;
            } catch (error) {
                if (!(error instanceof WalkingVerificationError)) throw error;
                verificationFailures.push({ code: error.code, details: error.details });

                const verifiedOriginWalk = error.details?.precedingWalk;
                if (error.code === "WALKING_CONNECTION_INFEASIBLE" &&
                    verifiedOriginWalk?.kind === "origin_access" &&
                    verifiedOriginWalk.toStopId != null) {
                    originWalkOverridesByStopId.set(
                        String(verifiedOriginWalk.toStopId),
                        { ...verifiedOriginWalk, estimated: false }
                    );
                    shouldRetryWithVerifiedOriginWalk = true;
                    break;
                }

                if (error.code === "WALKING_DISTANCE_EXCEEDED" &&
                    Number.isInteger(error.details?.actionIndex)) {
                    const rejectedAction = candidate.itinerary[error.details.actionIndex];
                    if (rejectedAction?.type === "walk") {
                        rejectedWalkingEdges.add(walkingEdgeKey(rejectedAction));
                    }
                }
            }
        }

        if (!shouldRetryWithVerifiedOriginWalk) break;
    }

    if (!verifiedJourney) {
        const lastFailure = verificationFailures.at(-1);
        return phase2Failure(
            phase1,
            raptorJourney?.reason || lastFailure?.code || "raptor_candidates_not_verified",
            { raptorJourney, verificationFailures }
        );
    }

    return {
        success: true,
        phase: "phase_2",
        reason: null,
        phase1,
        phase2: {
            routingEngine: "raptor",
            raptorJourney,
            verifiedJourney
        },
        bestConnection: null,
        verifiedJourney,
        finalArrivalTime: verifiedJourney.arrivalTime
    };
}


function runRaptor(options, originWalkOverridesByStopId) {
    return planRaptorJourney({
        originStopIds: options.originStopIds,
        destinationStopIds: options.destinationStopIds,
        originLocation: options.originLocation,
        destinationLocation: options.destinationLocation,
        departureTimeSeconds: options.departureTimeSeconds,
        kdTree: options.kdTree,
        stopById: options.stopById,
        tripsByRoute: options.tripsByRoute,
        stopTimesByTrip: options.stopTimesByTrip,
        travelDate: options.travelDate,
        serviceByDate: options.serviceByDate,
        minimumTransferSeconds: options.minimumTransferSeconds ?? 300,
        maximumBoardings: options.maximumBoardings ?? 5,
        maximumWalkingMetres: options.maximumWalkingMetres ?? 600,
        allowedRouteTypes: options.allowedRouteTypes ?? null,
        originWalkOverridesByStopId
    });
}


function isRecoverableOrsError(error) {
    return /ORS_|ORS Matrix|quota exceeded|rate.?limit|status (401|403|404|429)|access.*disallowed|unauthorized|forbidden/i.test(
        String(error?.message || error)
    );
}


function walkingEdgeKey(action) {
    return [
        action.fromStopId ?? "origin",
        action.toStopId ?? "destination"
    ].map(String).join("|");
}


function phase2Failure(phase1, reason, details) {
    return {
        success: false,
        phase: "phase_2",
        reason,
        phase1,
        phase2: details,
        bestConnection: null,
        verifiedJourney: null,
        finalArrivalTime: null
    };
}


module.exports = planHierarchicalTransfer;
/* Retain the old export name for callers/tests while broadening the recovery
 * to other temporary ORS configuration and availability failures. */
module.exports.isOrsQuotaError = isRecoverableOrsError;
module.exports.isRecoverableOrsError = isRecoverableOrsError;
