const {
    nearest,
    withinRadius,
    distanceMetres
} = require("./nearestStop");


/*
 * Selects the closest physical ETS stops around a resolved user location.
 *
 * This is a local geometric operation. It does not claim that the stops are
 * walkable and does not call ORS or Google. Separate physical stop IDs are
 * preserved so opposite-direction bays remain available for trip validation.
 */
function selectEndpointStops({
    kdTree,
    lat,
    lon,
    radiusMetres = 600,
    maximumStops = 20
}) {
    const numericLat = Number(lat);
    const numericLon = Number(lon);

    if (
        !Number.isFinite(numericLat) ||
        !Number.isFinite(numericLon)
    ) {
        throw new TypeError(
            "Endpoint-stop selection requires valid coordinates."
        );
    }

    if (!Number.isInteger(maximumStops) || maximumStops < 1) {
        throw new TypeError("maximumStops must be a positive integer.");
    }

    const nearby = withinRadius(
        kdTree,
        numericLat,
        numericLon,
        radiusMetres
    );

    let candidates = nearby.slice(0, maximumStops);
    let usedNearestFallback = false;

    if (candidates.length === 0) {
        const nearestResult = nearest(
            kdTree,
            numericLat,
            numericLon
        );

        if (!nearestResult?.stop) {
            return {
                stops: [],
                candidates: [],
                closestDistanceMetres: null,
                usedNearestFallback: false
            };
        }

        candidates = [{
            stop: nearestResult.stop,
            distanceMetres: distanceMetres(
                numericLat,
                numericLon,
                Number(nearestResult.stop.lat),
                Number(nearestResult.stop.lon)
            )
        }];
        usedNearestFallback = true;
    }

    const normalizedCandidates = candidates.map(candidate => ({
        stop: candidate.stop,
        stopId: String(candidate.stop.stopId),
        lat: Number(candidate.stop.lat),
        lon: Number(candidate.stop.lon),
        straightLineMetres: candidate.distanceMetres
    }));

    return {
        stops: normalizedCandidates.map(candidate => ({
            ...candidate.stop,
            endpointDistanceMetres: candidate.straightLineMetres
        })),
        candidates: normalizedCandidates,
        closestDistanceMetres:
            normalizedCandidates[0]?.straightLineMetres ?? null,
        usedNearestFallback
    };
}


module.exports = selectEndpointStops;
