const getOrsWalkingMatrix = require("./getOrsWalkingMatrix");


/* Keeps only original KD candidates whose ORS pedestrian route is <= limit. */
async function filterTransferCandidatesWithOrs({
    candidates,
    maximumWalkingSeconds = 600,
    maximumWalkingMetres = 600,
    ...matrixOptions
}) {
    const matrix = await getOrsWalkingMatrix({
        candidates,
        ...matrixOptions
    });
    const accepted = [];
    const rejected = {
        noPedestrianRoute: 0,
        overWalkingLimit: 0,
        overDistanceLimit: 0
    };

    for (const candidate of candidates) {
        const key = [
            candidate.firstExitStopId,
            candidate.secondBoardingStopId
        ].join("|");
        const walking = matrix.get(key);

        if (
            !walking ||
            !Number.isFinite(walking.durationSeconds) ||
            !Number.isFinite(walking.distanceMetres)
        ) {
            rejected.noPedestrianRoute++;
            continue;
        }

        if (walking.durationSeconds > maximumWalkingSeconds) {
            rejected.overWalkingLimit++;
            continue;
        }

        if (walking.distanceMetres > maximumWalkingMetres) {
            rejected.overDistanceLimit++;
            continue;
        }

        accepted.push({
            ...candidate,
            orsWalkingSeconds: walking.durationSeconds,
            orsWalkingMetres: walking.distanceMetres,
            pedestrianVerification: "verified_ors"
        });
    }

    return {
        candidates: accepted,
        rejected,
        checked: candidates.length
    };
}


module.exports = filterTransferCandidatesWithOrs;
