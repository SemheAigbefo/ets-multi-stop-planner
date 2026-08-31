/*
 * Joins ORS-verified stop pairs with their directional trip contexts and
 * rejects second buses that cannot be caught after walking and the buffer.
 */
function buildScheduledTransferConnections({
    candidates,
    minimumBoardingBufferSeconds = 300
}) {
    const connections = [];

    for (const candidate of candidates) {
        for (const firstTrip of candidate.firstTripOptions) {
            const earliestSecondBoarding =
                firstTrip.firstArrivalTimeSeconds +
                candidate.orsWalkingSeconds +
                minimumBoardingBufferSeconds;

            for (const secondTrip of candidate.secondTripOptions) {
                if (
                    secondTrip.secondDepartureTimeSeconds <
                    earliestSecondBoarding
                ) {
                    continue;
                }

                connections.push({
                    firstTrip,
                    transfer: {
                        fromStopId: candidate.firstExitStopId,
                        toStopId: candidate.secondBoardingStopId,
                        walkingSeconds: candidate.orsWalkingSeconds,
                        walkingMetres: candidate.orsWalkingMetres,
                        source: "openrouteservice"
                    },
                    secondTrip,
                    transferWaitSeconds:
                        secondTrip.secondDepartureTimeSeconds -
                        (
                            firstTrip.firstArrivalTimeSeconds +
                            candidate.orsWalkingSeconds
                        ),
                    finalArrivalTime:
                        secondTrip.destinationArrivalTime,
                    finalArrivalTimeSeconds:
                        secondTrip.destinationArrivalTimeSeconds,
                    googleVerification: "pending"
                });
            }
        }
    }

    connections.sort((first, second) => {
        if (
            first.finalArrivalTimeSeconds !==
            second.finalArrivalTimeSeconds
        ) {
            return first.finalArrivalTimeSeconds -
                second.finalArrivalTimeSeconds;
        }

        return first.transfer.walkingSeconds -
            second.transfer.walkingSeconds;
    });

    return connections;
}


module.exports = buildScheduledTransferConnections;
