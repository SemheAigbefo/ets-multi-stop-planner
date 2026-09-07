const getOrsWalkingMatrix =
    require("../ors/getOrsWalkingMatrix");
const {
    getGoogleWalkingRoute
} = require("../google/getGoogleWalkingRoute");
const {
    gtfsTimeToSeconds,
    secondsToGtfsTime
} = require("../graph/gtfsTime");


/* Verifies every physical walk in a selected transit-centre BFS journey. */
async function verifyTransitCentreJourney({
    journey,
    requestedDepartureTimeSeconds,
    originLocation = null,
    destinationLocation = null,
    stopById,
    orsApiKey,
    orsMatrixUrl,
    googleRoutesApiKey,
    maximumWalkingMetres = 600,
    maximumWalkingSeconds = 600,
    minimumTransferSeconds = 300,
    getTransferBufferSeconds = null,
    walkingRouteCache = null,
    fetchImpl
}) {
    if (!journey?.success) {
        return failure("centre_bfs_failed");
    }

    const transitLegs = buildTransitLegs(journey);

    if (transitLegs.length === 0) {
        return failure("no_transit_legs");
    }

    const walkingSegments = buildWalkingSegments({
        transitLegs,
        originLocation,
        destinationLocation,
        stopById
    });
    const routedSegments = walkingSegments.filter(segment => !segment.zeroWalk);
    const uncachedSegments = [];

    for (const segment of routedSegments) {
        const cached = walkingRouteCache?.get(
            segment.origin,
            segment.destination
        );

        if (cached) {
            segment.googleWalk = cached;
        } else {
            uncachedSegments.push(segment);
        }
    }

    if (uncachedSegments.length > 0) {
        const orsCandidates = uncachedSegments.map(segment => ({
            firstExitStopId: segment.segmentId,
            secondBoardingStopId: segment.segmentId,
            firstExitCoordinates: segment.origin,
            secondBoardingCoordinates: segment.destination
        }));
        const orsMatrix = await getOrsWalkingMatrix({
            candidates: orsCandidates,
            apiKey: orsApiKey,
            matrixUrl: orsMatrixUrl,
            fetchImpl
        });

        for (const segment of uncachedSegments) {
            const orsWalk = orsMatrix.get(
                `${segment.segmentId}|${segment.segmentId}`
            );

            if (!withinLimit(
                orsWalk,
                maximumWalkingMetres,
                maximumWalkingSeconds
            )) {
                return failure("ors_walking_limit_exceeded", segment);
            }

            segment.orsWalk = orsWalk;
        }
    }

    for (const segment of uncachedSegments) {
        const googleWalk = await getGoogleWalkingRoute({
            origin: segment.origin,
            destination: segment.destination,
            apiKey: googleRoutesApiKey,
            fetchImpl
        });

        if (!withinLimit(
            googleWalk,
            maximumWalkingMetres,
            maximumWalkingSeconds
        )) {
            return failure("google_walking_limit_exceeded", segment);
        }

        segment.googleWalk = googleWalk;
        walkingRouteCache?.set(
            segment.origin,
            segment.destination,
            googleWalk
        );
    }

    return replayJourney({
        transitLegs,
        walkingSegments,
        requestedDepartureTimeSeconds,
        minimumTransferSeconds,
        getTransferBufferSeconds
    });
}


function buildTransitLegs(journey) {
    const legs = [];
    const access = journey.startingAccess;

    if (access?.type === "origin_bus_to_transit_centre") {
        legs.push({
            kind: "origin_access_bus",
            ...access
        });
    }

    for (const connection of journey.connections || []) {
        legs.push({
            kind: "transit_centre_bus",
            ...connection
        });
    }

    const egress = journey.destinationEgress;

    if (egress?.type === "transit_centre_bus_to_destination") {
        legs.push({
            kind: "destination_egress_bus",
            ...egress,
            arrivalStopId: egress.destinationStopId
        });
    }

    return legs;
}


function buildWalkingSegments({
    transitLegs,
    originLocation,
    destinationLocation,
    stopById
}) {
    const segments = [];

    if (originLocation) {
        addSegment(
            segments,
            "origin-access",
            originLocation,
            stopById.get(String(transitLegs[0].boardingStopId)),
            "origin_access"
        );
    }

    for (let index = 1; index < transitLegs.length; index++) {
        const previous = transitLegs[index - 1];
        const next = transitLegs[index];

        addSegment(
            segments,
            `transfer-${index}`,
            stopById.get(String(previous.arrivalStopId)),
            stopById.get(String(next.boardingStopId)),
            "centre_transfer",
            index,
            next.fromCentreId ||
                previous.toCentreId ||
                previous.arrivalCentreId ||
                next.centreId ||
                null
        );
    }

    if (destinationLocation) {
        const lastLeg = transitLegs[transitLegs.length - 1];

        addSegment(
            segments,
            "final-walk",
            stopById.get(String(lastLeg.arrivalStopId)),
            destinationLocation,
            "destination_walk"
        );
    }

    return segments;
}


function addSegment(
    segments,
    segmentId,
    origin,
    destination,
    kind,
    beforeLegIndex = null,
    centreId = null
) {
    if (!origin || !destination) {
        throw new Error(`Walking endpoints are missing for ${segmentId}.`);
    }

    const sameStop =
        origin.stopId !== undefined &&
        destination.stopId !== undefined &&
        String(origin.stopId) === String(destination.stopId);

    segments.push({
        segmentId,
        kind,
        beforeLegIndex,
        centreId,
        origin,
        destination,
        zeroWalk: sameStop,
        googleWalk: sameStop
            ? {
                durationSeconds: 0,
                distanceMetres: 0,
                encodedPolyline: null,
                source: "same_physical_stop"
            }
            : null
    });
}


function replayJourney({
    transitLegs,
    walkingSegments,
    requestedDepartureTimeSeconds,
    minimumTransferSeconds,
    getTransferBufferSeconds
}) {
    const actions = [];
    let currentTime = requestedDepartureTimeSeconds;

    for (let index = 0; index < transitLegs.length; index++) {
        const walk = walkingSegments.find(segment =>
            segment.kind === "origin_access" && index === 0 ||
            segment.beforeLegIndex === index
        );

        if (walk) {
            currentTime += walk.googleWalk.durationSeconds;
            actions.push(walkingAction(walk));
        }

        const leg = transitLegs[index];
        const departure = gtfsTimeToSeconds(leg.departureTime);
        const transferBuffer = index === 0
            ? 0
            : typeof getTransferBufferSeconds === "function"
                ? getTransferBufferSeconds({
                    centreId: walk?.centreId || null,
                    fromStopId: walk?.origin?.stopId ?? null,
                    toStopId: walk?.destination?.stopId ?? null,
                    fallbackSeconds: minimumTransferSeconds
                })
                : minimumTransferSeconds;

        if (currentTime + transferBuffer > departure) {
            return failure("verified_walk_misses_bus", {
                legIndex: index,
                tripId: leg.tripId
            });
        }

        actions.push({
            type: "transit",
            kind: leg.kind,
            routeId: leg.routeId,
            tripId: leg.tripId,
            headsign: leg.headsign || null,
            fromStopId: leg.boardingStopId,
            toStopId: leg.arrivalStopId,
            departureTime: leg.departureTime,
            arrivalTime: leg.arrivalTime
        });
        currentTime = gtfsTimeToSeconds(leg.arrivalTime);
    }

    const finalWalk = walkingSegments.find(
        segment => segment.kind === "destination_walk"
    );

    if (finalWalk) {
        currentTime += finalWalk.googleWalk.durationSeconds;
        actions.push(walkingAction(finalWalk));
    }

    return {
        success: true,
        reason: null,
        arrivalTimeSeconds: currentTime,
        arrivalTime: secondsToGtfsTime(currentTime),
        actions,
        walkingSegments: walkingSegments.map(segment => ({
            segmentId: segment.segmentId,
            kind: segment.kind,
            centreId: segment.centreId,
            durationSeconds: segment.googleWalk.durationSeconds,
            distanceMetres: segment.googleWalk.distanceMetres,
            encodedPolyline: segment.googleWalk.encodedPolyline,
            source: segment.googleWalk.source
        }))
    };
}


function walkingAction(segment) {
    return {
        type: "walk",
        kind: segment.kind,
        fromStopId: segment.origin.stopId ?? null,
        toStopId: segment.destination.stopId ?? null,
        fromLocation: segment.origin.stopId === undefined
            ? {
                lat: Number(segment.origin.lat),
                lon: Number(segment.origin.lon)
            }
            : null,
        toLocation: segment.destination.stopId === undefined
            ? {
                lat: Number(segment.destination.lat),
                lon: Number(segment.destination.lon)
            }
            : null,
        durationSeconds: segment.googleWalk.durationSeconds,
        distanceMetres: segment.googleWalk.distanceMetres,
        encodedPolyline: segment.googleWalk.encodedPolyline,
        source: segment.googleWalk.source
    };
}


function withinLimit(walk, maximumMetres, maximumSeconds) {
    return Boolean(walk) &&
        Number.isFinite(walk.distanceMetres) &&
        Number.isFinite(walk.durationSeconds) &&
        walk.distanceMetres <= maximumMetres &&
        walk.durationSeconds <= maximumSeconds;
}


function failure(reason, details = null) {
    return {
        success: false,
        reason,
        details,
        actions: [],
        walkingSegments: []
    };
}


module.exports = verifyTransitCentreJourney;
