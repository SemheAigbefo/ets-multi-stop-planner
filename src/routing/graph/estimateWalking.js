/*
 * Converts straight-line KD-tree distance into a conservative walking
 * estimate. The detour factor approximates sidewalks and street geometry
 * until Google Routes verifies walking segments in a selected itinerary.
 */
function estimateWalking(
    straightLineMetres,
    {
        walkingSpeedMetresPerSecond = 1.4,
        detourFactor = 1.2
    } = {}
) {
    const distance = Number(straightLineMetres);

    if (!Number.isFinite(distance) || distance < 0) {
        throw new TypeError(
            "straightLineMetres must be a non-negative number."
        );
    }

    if (
        !Number.isFinite(walkingSpeedMetresPerSecond) ||
        walkingSpeedMetresPerSecond <= 0
    ) {
        throw new TypeError(
            "walkingSpeedMetresPerSecond must be greater than zero."
        );
    }

    if (!Number.isFinite(detourFactor) || detourFactor < 1) {
        throw new TypeError("detourFactor must be at least 1.");
    }

    const distanceMetres = distance * detourFactor;
    const durationSeconds = Math.ceil(
        distanceMetres / walkingSpeedMetresPerSecond
    );

    return {
        straightLineMetres: distance,
        distanceMetres,
        durationSeconds,
        estimated: true
    };
}


module.exports = estimateWalking;
