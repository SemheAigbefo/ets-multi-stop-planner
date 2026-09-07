function canonicalTransitCentreName(stopName) {
    const name = String(stopName || "").trim();
    const lowerName = name.toLowerCase();

    if (
        !lowerName.includes("transit centre") ||
        lowerName.includes("elevator") ||
        lowerName.includes("access")
    ) {
        return null;
    }

    /* Several GTFS names describe a road beside the same physical centre. */
    if (lowerName.includes("clareview")) {
        return "Clareview Transit Centre";
    }

    if (lowerName.includes("jasper place")) {
        return "Jasper Place Transit Centre";
    }

    if (lowerName.includes("stadium")) {
        return "Stadium Transit Centre";
    }

    const roadPrefixMatch = name.match(/\bat\s+(.+ Transit Centre)$/i);

    return roadPrefixMatch?.[1] || name;
}


function centreIdFromName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}


/* Groups all bays/platform stop IDs under one logical transit-centre node. */
function identifyTransitCentres(stopById) {
    const centresById = new Map();
    const centreByStopId = new Map();

    for (const [stopIdValue, stop] of stopById) {
        const name = canonicalTransitCentreName(stop.name);

        if (!name) continue;

        const centreId = centreIdFromName(name);

        if (!centresById.has(centreId)) {
            centresById.set(centreId, {
                centreId,
                name,
                physicalStops: [],
                stopIds: []
            });
        }

        const centre = centresById.get(centreId);
        const stopId = String(stopIdValue);

        centre.physicalStops.push(stop);
        centre.stopIds.push(stopId);
        centreByStopId.set(stopId, centreId);
    }

    return {
        centresById,
        centreByStopId
    };
}


module.exports = {
    identifyTransitCentres,
    canonicalTransitCentreName,
    centreIdFromName
};
