const buildDirectionalTransferSets =
    require("./buildDirectionalTransferSets");
const {
    findNearbyTransferPairs
} = require("./findNearbyTransferPairs");


/* Produces the complete, direction-aware candidate records consumed by ORS. */
function buildDirectionalTransferCandidates(options) {
    const sets = buildDirectionalTransferSets(options);

    const spatialPairs = findNearbyTransferPairs({
        firstExitStops: sets.firstExitStops,
        secondBoardingStops: sets.secondBoardingStops,
        maximumStraightLineMetres:
            options.maximumStraightLineMetres ?? 1000,
        maximumPairsPerExit:
            options.maximumPairsPerExit ?? 20
    });

    const candidates = spatialPairs.map(pair => ({
        ...pair,
        firstTripOptions:
            sets.firstContextsByStopId.get(
                pair.firstExitStopId
            ) || [],
        secondTripOptions:
            sets.secondContextsByStopId.get(
                pair.secondBoardingStopId
            ) || []
    }));

    return {
        candidates,
        sets,
        statistics: {
            ...sets.statistics,
            firstExitStops: sets.firstExitStops.length,
            secondBoardingStops: sets.secondBoardingStops.length,
            spatialPairs: candidates.length
        }
    };
}


module.exports = buildDirectionalTransferCandidates;
