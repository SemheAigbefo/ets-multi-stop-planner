const {
    insert,
    withinRadius
} = require("../../spatial/nearestStop");


function buildStopSubsetTree(stops) {
    let tree = null;

    for (const stop of stops) {
        tree = insert(tree, stop);
    }

    return tree;
}


/*
 * Set A contains reachable downstream exit stops from first-bus trips.
 * Set B contains possible second-bus boarding stops whose trips can reach the
 * destination. A temporary KD-tree over B avoids an A x B brute-force scan.
 *
 * Results are geographic candidates only. ORS must still calculate actual
 * pedestrian durations and enforce the ten-minute walking rule.
 */
function findNearbyTransferPairs({
    firstExitStops,
    secondBoardingStops,
    maximumStraightLineMetres = 1000,
    maximumPairsPerExit = 20
}) {
    if (
        !Array.isArray(firstExitStops) ||
        !Array.isArray(secondBoardingStops)
    ) {
        throw new TypeError("Transfer stop sets must be arrays.");
    }

    if (
        firstExitStops.length === 0 ||
        secondBoardingStops.length === 0
    ) {
        return [];
    }

    const secondStopTree = buildStopSubsetTree(secondBoardingStops);
    const pairs = [];
    const pairKeys = new Set();

    for (const firstStop of firstExitStops) {
        const nearbySecondStops = withinRadius(
            secondStopTree,
            firstStop.lat,
            firstStop.lon,
            maximumStraightLineMetres
        ).slice(0, maximumPairsPerExit);

        for (const candidate of nearbySecondStops) {
            const firstStopId = String(firstStop.stopId);
            const secondStopId = String(candidate.stop.stopId);
            const pairKey = `${firstStopId}|${secondStopId}`;

            if (pairKeys.has(pairKey)) {
                continue;
            }

            pairKeys.add(pairKey);
            pairs.push({
                firstExitStop: firstStop,
                secondBoardingStop: candidate.stop,
                firstExitStopId: firstStopId,
                secondBoardingStopId: secondStopId,
                firstExitCoordinates: {
                    lat: Number(firstStop.lat),
                    lon: Number(firstStop.lon)
                },
                secondBoardingCoordinates: {
                    lat: Number(candidate.stop.lat),
                    lon: Number(candidate.stop.lon)
                },
                straightLineMetres: candidate.distanceMetres,
                pedestrianVerification: "pending_ors"
            });
        }
    }

    pairs.sort(
        (first, second) =>
            first.straightLineMetres - second.straightLineMetres
    );

    return pairs;
}


module.exports = {
    buildStopSubsetTree,
    findNearbyTransferPairs
};
