function uniqueStops(candidates, idField, coordinateField) {
    const stopsById = new Map();

    for (const candidate of candidates) {
        const stopId = String(candidate[idField]);

        if (!stopsById.has(stopId)) {
            stopsById.set(stopId, {
                stopId,
                ...candidate[coordinateField]
            });
        }
    }

    return [...stopsById.values()];
}


function chunks(values, size) {
    const result = [];

    for (let index = 0; index < values.length; index += size) {
        result.push(values.slice(index, index + size));
    }

    return result;
}


async function readResponseBody(response) {
    const text = await response.text();

    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}


/*
 * Calls the ORS pedestrian Matrix API in bounded source/destination chunks.
 * ORS requires coordinate order [longitude, latitude]. Results are mapped
 * back by physical stop IDs so the caller can ignore unwanted cross-products.
 */
async function getOrsWalkingMatrix({
    candidates,
    apiKey = process.env.ORS_API_KEY,
    matrixUrl = process.env.ORS_MATRIX_URL,
    fetchImpl = globalThis.fetch,
    maximumMatrixCells = 3500
}) {
    if (!Array.isArray(candidates)) {
        throw new TypeError("ORS candidates must be an array.");
    }

    if (candidates.length === 0) {
        return new Map();
    }

    if (!apiKey) {
        throw new Error("ORS_API_KEY is not configured.");
    }

    if (!matrixUrl) {
        throw new Error("ORS_MATRIX_URL is not configured.");
    }

    if (typeof fetchImpl !== "function") {
        throw new TypeError("A fetch implementation is required.");
    }

    if (!Number.isInteger(maximumMatrixCells) || maximumMatrixCells < 1) {
        throw new TypeError("maximumMatrixCells must be a positive integer.");
    }

    const sourceStops = uniqueStops(
        candidates,
        "firstExitStopId",
        "firstExitCoordinates"
    );
    const destinationStops = uniqueStops(
        candidates,
        "secondBoardingStopId",
        "secondBoardingCoordinates"
    );
    const results = new Map();
    const destinationChunkSize = Math.min(
        destinationStops.length,
        maximumMatrixCells
    );

    for (
        const destinationChunk
        of chunks(destinationStops, destinationChunkSize)
    ) {
        const sourceChunkSize = Math.max(
            1,
            Math.floor(
                maximumMatrixCells / destinationChunk.length
            )
        );

        for (const sourceChunk of chunks(sourceStops, sourceChunkSize)) {
            const locations = [
                ...sourceChunk.map(stop => [
                    Number(stop.lon),
                    Number(stop.lat)
                ]),
                ...destinationChunk.map(stop => [
                    Number(stop.lon),
                    Number(stop.lat)
                ])
            ];
            const sourceIndexes = sourceChunk.map(
                (_, index) => String(index)
            );
            const destinationIndexes = destinationChunk.map(
                (_, index) => String(sourceChunk.length + index)
            );

            const response = await fetchImpl(matrixUrl, {
                method: "POST",
                headers: {
                    Authorization: apiKey,
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    locations,
                    sources: sourceIndexes,
                    destinations: destinationIndexes,
                    metrics: ["duration", "distance"],
                    units: "m"
                })
            });

            const data = await readResponseBody(response);

            if (!response.ok) {
                const endpointHint = response.status === 404
                    ? ` Check ORS_MATRIX_URL; expected a URL like ` +
                        "https://api.openrouteservice.org/v2/matrix/foot-walking."
                    : "";

                throw new Error(
                    (data.error?.message ||
                    data.error ||
                    data.message ||
                    `ORS Matrix request failed with status ${response.status}.`) +
                    endpointHint
                );
            }

            for (
                let sourceIndex = 0;
                sourceIndex < sourceChunk.length;
                sourceIndex++
            ) {
                for (
                    let destinationIndex = 0;
                    destinationIndex < destinationChunk.length;
                    destinationIndex++
                ) {
                    const durationSeconds =
                        data.durations?.[sourceIndex]?.[destinationIndex];
                    const distanceMetres =
                        data.distances?.[sourceIndex]?.[destinationIndex];
                    const key = [
                        sourceChunk[sourceIndex].stopId,
                        destinationChunk[destinationIndex].stopId
                    ].join("|");

                    results.set(key, {
                        durationSeconds:
                            durationSeconds === null ||
                            durationSeconds === undefined
                                ? null
                                : Number(durationSeconds),
                        distanceMetres:
                            distanceMetres === null ||
                            distanceMetres === undefined
                                ? null
                                : Number(distanceMetres)
                    });
                }
            }
        }
    }

    return results;
}


module.exports = getOrsWalkingMatrix;
