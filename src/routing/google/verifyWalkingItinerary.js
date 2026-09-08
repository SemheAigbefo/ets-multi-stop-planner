const {
    getGoogleWalkingRoute
} = require("./getGoogleWalkingRoute");
const {
    secondsToGtfsTime
} = require("../graph/gtfsTime");


class WalkingVerificationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = "WalkingVerificationError";
        this.code = details.code || "WALKING_VERIFICATION_FAILED";
        this.details = details;
    }
}


/*
 * Verifies only the walking actions selected by graph search. After Google
 * replaces estimated durations, the itinerary timeline is replayed to ensure
 * every later scheduled departure is still catchable.
 */
async function verifyWalkingItinerary({
    journey,
    stopById,
    apiKey = process.env.GOOGLE_ROUTES_API_KEY,
    fetchImpl = globalThis.fetch,
    minimumTransferSeconds = 300,
    maximumSegmentMetres = 600
}) {
    if (!journey?.success) {
        return journey;
    }

    const itinerary = journey.itinerary.map(action => ({ ...action }));
    const walkingIndexes = [];

    for (let index = 0; index < itinerary.length; index++) {
        if (itinerary[index].type === "walk") {
            walkingIndexes.push(index);
        }
    }

    const verifiedRoutes = await Promise.all(
        walkingIndexes.map(async index => {
            const action = itinerary[index];
            const origin = action.fromLocation ||
                stopById.get(String(action.fromStopId));
            const destination = action.toLocation ||
                stopById.get(String(action.toStopId));

            if (!origin || !destination) {
                throw new WalkingVerificationError(
                    "A walking endpoint is missing from stopById.",
                    {
                        code: "WALKING_STOP_NOT_FOUND",
                        actionIndex: index,
                        fromStopId: action.fromStopId,
                        toStopId: action.toStopId
                    }
                );
            }

            try {
                return await getGoogleWalkingRoute({
                    origin,
                    destination,
                    apiKey,
                    fetchImpl
                });
            } catch (error) {
                if (error instanceof WalkingVerificationError) {
                    throw error;
                }

                throw new WalkingVerificationError(
                    error.message,
                    {
                        actionIndex: index,
                        fromStopId: action.fromStopId,
                        toStopId: action.toStopId
                    }
                );
            }
        })
    );

    for (let resultIndex = 0; resultIndex < walkingIndexes.length; resultIndex++) {
        const actionIndex = walkingIndexes[resultIndex];
        const verified = verifiedRoutes[resultIndex];

        if (verified.distanceMetres > maximumSegmentMetres) {
            throw new WalkingVerificationError(
                "Google-verified walk exceeds the 600 metre limit.",
                {
                    code: "WALKING_DISTANCE_EXCEEDED",
                    actionIndex,
                    distanceMetres: verified.distanceMetres,
                    maximumSegmentMetres
                }
            );
        }

        itinerary[actionIndex] = {
            ...itinerary[actionIndex],
            ...verified,
            estimated: false
        };
    }

    let currentTime = journey.departureTimeSeconds;
    let boardings = 0;
    let walkingSeconds = 0;
    let walkingMetres = 0;

    for (let index = 0; index < itinerary.length; index++) {
        const action = itinerary[index];

        if (action.type === "walk") {
            currentTime += action.durationSeconds;
            walkingSeconds += action.durationSeconds;
            walkingMetres += action.distanceMetres;
            continue;
        }

        if (action.type === "transit") {
            const requiredBuffer = boardings > 0
                ? minimumTransferSeconds
                : 0;

            if (
                currentTime + requiredBuffer >
                action.departureTimeSeconds
            ) {
                throw new WalkingVerificationError(
                    "Verified walking time makes a transit connection impossible.",
                    {
                        code: "WALKING_CONNECTION_INFEASIBLE",
                        actionIndex: index,
                        tripId: action.tripId,
                        requiredArrivalTimeSeconds:
                            action.departureTimeSeconds - requiredBuffer,
                        actualArrivalTimeSeconds: currentTime,
                        precedingWalk: index > 0 && itinerary[index - 1].type === "walk"
                            ? { ...itinerary[index - 1] }
                            : null
                    }
                );
            }

            currentTime = action.arrivalTimeSeconds;
            boardings++;
        }
    }

    return {
        ...journey,
        arrivalTimeSeconds: currentTime,
        arrivalTime: secondsToGtfsTime(currentTime),
        durationSeconds:
            currentTime - journey.departureTimeSeconds,
        walkingSeconds,
        walkingMetres,
        itinerary,
        walkingVerification: {
            verified: true,
            segmentsVerified: walkingIndexes.length,
            source: "google_routes"
        }
    };
}


module.exports = {
    verifyWalkingItinerary,
    WalkingVerificationError
};
