const config = require("../../../data/config/transitCentreBuffers.json");


function getTransferBufferSeconds({
    centreId,
    fromStopId = null,
    toStopId = null,
    fallbackSeconds = config.defaultBufferSeconds
}) {
    if (
        fromStopId !== null &&
        toStopId !== null &&
        String(fromStopId) === String(toStopId)
    ) {
        return config.samePhysicalStopBufferSeconds;
    }

    const pairKey = fromStopId !== null && toStopId !== null
        ? `${fromStopId}|${toStopId}`
        : null;

    if (pairKey && Number.isFinite(config.bayPairOverrides[pairKey])) {
        return config.bayPairOverrides[pairKey];
    }

    if (centreId && Number.isFinite(config.centres[centreId])) {
        return config.centres[centreId];
    }

    return fallbackSeconds;
}


module.exports = getTransferBufferSeconds;
