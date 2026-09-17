const planLeg =
    require("./planLeg");
const planHierarchicalTransfer =
    require("./transitCentres/planHierarchicalTransfer");


function timeToSeconds(time) {
    const [hours, minutes, seconds = 0] =
        time.split(":").map(Number);

    return (
        hours * 3600 +
        minutes * 60 +
        seconds
    );
}


function getArrivalTime(itinerary) {
    if (itinerary.arrivalTime) {
        return itinerary.arrivalTime;
    }

    if (itinerary.routingEngine === "time_dependent_graph") {
        return itinerary.arrivalTime;
    }

    if (itinerary.type === "direct") {
        return itinerary.arrivalTime;
    }

    return itinerary.finalArrivalTime;
}


function getActualDepartureTime(itinerary) {
    if (itinerary.departureTime) {
        return itinerary.departureTime;
    }

    if (itinerary.routingEngine === "time_dependent_graph") {
        return itinerary.departureTime;
    }

    if (itinerary.type === "direct") {
        return itinerary.departureTime;
    }

    return itinerary.firstLeg.departureTime;
}


function summarizeItineraryTypes(legs) {
    const itineraryTypes =
        legs.map(
            leg => leg.itinerary.type
        );

    const uniqueTypes =
        [...new Set(itineraryTypes)];

    let journeyType = null;

    if (uniqueTypes.length === 1) {
        journeyType = uniqueTypes[0];
    } else if (uniqueTypes.length > 1) {
        journeyType = "mixed";
    }

    return {
        journeyType,
        itineraryTypes
    };
}


function chooseDepartureTime(
    earliestAvailableTime,
    preferredDepartureTime
) {
    if (!preferredDepartureTime) {
        return {
            effectiveDepartureTime:
                earliestAvailableTime,

            preferenceStatus:
                "not_requested"
        };
    }

    if (
        timeToSeconds(preferredDepartureTime) <
        timeToSeconds(earliestAvailableTime)
    ) {
        return {
            effectiveDepartureTime:
                earliestAvailableTime,

            preferenceStatus:
                "missed"
        };
    }

    return {
        effectiveDepartureTime:
            preferredDepartureTime,

        preferenceStatus:
            "used"
    };
}


/*
 * Plans every adjacent pair in a user-ordered list:
 *
 * stop 0 -> stop 1
 * stop 1 -> stop 2
 * stop 2 -> stop 3
 *
 * Each completed leg's arrival time becomes the earliest
 * possible departure time for the following leg.
 */
async function planMultiStopTrip({
    routeStops,
    travelDate,
    initialDepartureTime,
    kdTree,
    stopById,
    tripsByRoute,
    stopTimesByTrip,
    serviceByDate,
    minimumTransferMinutes = 5,
    walkingOptions = {},
    transitOptions = {},
    searchOptions = {},
    verifyWalking = false,
    googleRoutesApiKey,
    fetchImpl,
    hierarchicalOptions = null,
    hierarchicalPlanner = planHierarchicalTransfer,
    legPlanner = planLeg,
    allowedRouteTypes = null
}) {
    if (
        !Array.isArray(routeStops) ||
        routeStops.length < 2
    ) {
        return {
            success: false,
            reason: "At least two stops are required.",
            legs: []
        };
    }

    const legs = [];

    let earliestAvailableTime =
        initialDepartureTime;

    for (
        let index = 0;
        index < routeStops.length - 1;
        index++
    ) {
        const origin =
            routeStops[index];

        const destination =
            routeStops[index + 1];

        /* A time entered on a location applies when leaving that location.
         * Blank intermediate times continue from the preceding arrival. */
        const preferredDepartureTime =
            index === 0
                ? initialDepartureTime
                : routeStops[index].preferredDepartureTime || null;

        const {
            effectiveDepartureTime,
            preferenceStatus
        } = chooseDepartureTime(
            earliestAvailableTime,
            preferredDepartureTime
        );

        console.log("\n========== LEG START ==========");
        console.log({
            legNumber: index + 1,
            origin: origin.routingStop.name,
            destination: destination.routingStop.name,
            earliestAvailableTime,
            preferredDepartureTime,
            effectiveDepartureTime,
            preferenceStatus
        });

        let legResult =
            await legPlanner({
                originStop:
                    origin.routingStop,

                destinationStop:
                    destination.routingStop,

                travelDate,

                departureTime:
                    effectiveDepartureTime,

                kdTree,
                stopById,
                tripsByRoute,
                stopTimesByTrip,
                serviceByDate,
                minimumTransferMinutes,
                walkingOptions,
                transitOptions: { ...transitOptions, allowedRouteTypes },
                searchOptions,
                verifyWalking,
                googleRoutesApiKey,
                fetchImpl
            });

        console.log("Local planner result:", {
            legNumber: index + 1,
            found: Boolean(legResult.bestItinerary),
            type: legResult.bestItinerary?.type || null,
            departureTime:
                legResult.bestItinerary?.departureTime || null,
            arrivalTime:
                legResult.bestItinerary?.arrivalTime || null,
            failureReason: legResult.failureReason || null
        });

        const needsHierarchicalTransfer =
            hierarchicalOptions &&
            (
                !legResult.bestItinerary ||
                legResult.bestItinerary.type === "transfer"
            );

        if (needsHierarchicalTransfer) {
            console.log("Starting hierarchical search:", {
                legNumber: index + 1,
                departureTime: effectiveDepartureTime,
                departureTimeSeconds:
                    timeToSeconds(effectiveDepartureTime),
                originStopIds: origin.routingStop.stopIds,
                destinationStopIds: destination.routingStop.stopIds
            });

            const destinationDistanceByStopId = new Map(
                destination.routingStop.physicalStops.map(stop => [
                    String(stop.stopId),
                    stop.endpointDistanceMetres ?? 0
                ])
            );
            const hierarchical = await hierarchicalPlanner({
                originStopIds: origin.routingStop.stopIds,
                destinationStopIds: destination.routingStop.stopIds,
                travelDate,
                departureTimeSeconds: timeToSeconds(effectiveDepartureTime),
                stopById,
                tripsByRoute,
                stopTimesByTrip,
                serviceByDate,
                /* Always preserve the user-entered endpoint coordinates.
                 * Even an exact stop-name/intersection match may select a
                 * different nearby stop with earlier service, which requires
                 * a verified access or final walking segment. */
                originLocation: origin.routingStop.coordinates || null,
                destinationLocation:
                    destination.routingStop.coordinates || null,
                destinationDistanceByStopId,
                kdTree,
                allowedRouteTypes,
                googleRoutesApiKey,
                fetchImpl,
                ...hierarchicalOptions
            });

            console.log("Hierarchical result:", {
                legNumber: index + 1,
                success: hierarchical.success,
                phase: hierarchical.phase,
                reason: hierarchical.reason,
                finalArrivalTime: hierarchical.finalArrivalTime,
                phase1Reason: hierarchical.phase1?.reason || null,
                centrePath:
                    hierarchical.phase2?.centrePath?.centres || [],
                centrePathReason:
                    hierarchical.phase2?.centrePath?.reason || null,
                verificationReason:
                    hierarchical.phase2?.verifiedJourney?.reason || null,
                verificationDetails:
                    hierarchical.phase2?.verifiedJourney?.details || null
            });

            const hierarchicalResult = hierarchicalLegResult({
                origin: origin.routingStop,
                destination: destination.routingStop,
                requestedDepartureTime: effectiveDepartureTime,
                hierarchical
            });

            /*
             * Phase 1 is the purpose-built nearby-stop transfer algorithm and
             * remains preferred when it succeeds.  Phase 2 is a recovery
             * search through transit centres; it must not replace a valid
             * local graph itinerary with a longer transit-centre detour.
             */
            const shouldUseHierarchical =
                !legResult.bestItinerary ||
                (
                    hierarchical.success &&
                    hierarchical.phase === "phase_1"
                );

            if (shouldUseHierarchical) {
                legResult = hierarchicalResult;
            } else {
                legResult.hierarchicalAlternative = hierarchical;
            }
        }

        if (!legResult.bestItinerary) {
            const typeSummary =
                summarizeItineraryTypes(legs);

            return {
                success: false,

                reason:
                    "No valid itinerary was found for one of the legs.",

                failedLeg:
                    index + 1,

                failedOrigin:
                    origin.routingStop.name,

                failedDestination:
                    destination.routingStop.name,

                failedRoutingDetails:
                    legResult,

                ...typeSummary,

                legs
            };
        }

        /* Every routing engine now exposes the same walking fields to the
         * terminal and frontend. */
        legResult.bestItinerary = normalizeWalkingActions(
            legResult.bestItinerary
        );

        const arrivalTime =
            getArrivalTime(
                legResult.bestItinerary
            );

        console.log("Completed leg:", {
            legNumber: index + 1,
            searchedFrom: effectiveDepartureTime,
            actualDepartureTime:
                getActualDepartureTime(legResult.bestItinerary),
            arrivalTime
        });

        legs.push({
            legNumber:
                index + 1,

            origin:
                origin.routingStop.name,

            destination:
                destination.routingStop.name,

            preferredDepartureTime:
                preferredDepartureTime || null,

            earliestAvailableTime,

            searchedFrom:
                effectiveDepartureTime,

            preferenceStatus,

            actualDepartureTime:
                getActualDepartureTime(
                    legResult.bestItinerary
                ),

            arrivalTime,

            itinerary:
                legResult.bestItinerary,

            routingDetails:
                legResult
        });

        earliestAvailableTime =
            arrivalTime;
    }

    const typeSummary =
        summarizeItineraryTypes(legs);

    return {
        success: true,
        travelDate,
        initialDepartureTime,
        ...typeSummary,
        finalArrivalTime:
            legs[legs.length - 1].arrivalTime,
        legs
    };
}


function normalizeWalkingActions(itinerary) {
    if (!Array.isArray(itinerary?.itinerary)) return itinerary;

    return {
        ...itinerary,
        itinerary: itinerary.itinerary.map(action => {
            if (action.type !== "walk") return action;

            const durationSeconds = Number(
                action.durationSeconds ?? action.walkingSeconds
            );
            const distanceMetres = Number(
                action.distanceMetres ?? action.walkingMetres
            );

            return {
                ...action,
                durationSeconds:
                    Number.isFinite(durationSeconds)
                        ? durationSeconds
                        : null,
                durationMinutes:
                    Number.isFinite(durationSeconds)
                        ? Math.ceil(durationSeconds / 60)
                        : null,
                distanceMetres:
                    Number.isFinite(distanceMetres)
                        ? distanceMetres
                        : null
            };
        })
    };
}


function hierarchicalLegResult({
    origin,
    destination,
    requestedDepartureTime,
    hierarchical
}) {
    if (!hierarchical.success) {
        return {
            origin: origin.name,
            destination: destination.name,
            requestedDepartureTime,
            routingEngine: "hierarchical_transfer",
            bestItinerary: null,
            failureReason: hierarchical.reason,
            hierarchical
        };
    }

    const rawItinerary = hierarchical.phase === "phase_1"
        ? phase1Actions(hierarchical.bestConnection, origin.coordinates)
        : hierarchical.verifiedJourney.actions;
    const itinerary = rawItinerary.map(action => {
        if (action.type !== "walk") return action;

        if (action.kind === "origin_access" && action.fromStopId === null) {
            return {
                ...action,
                fromName: origin.name,
                fromLocation: action.fromLocation ||
                    (origin.coordinates ? { ...origin.coordinates } : null)
            };
        }

        if (action.kind === "destination_walk" && action.toStopId === null) {
            return {
                ...action,
                toName: destination.name,
                toLocation: action.toLocation ||
                    (destination.coordinates
                        ? { ...destination.coordinates }
                        : null)
            };
        }

        return action;
    });
    const departureTime = itinerary.find(
        action => action.type === "transit"
    )?.departureTime || requestedDepartureTime;

    return {
        origin: origin.name,
        destination: destination.name,
        requestedDepartureTime,
        routingEngine: "hierarchical_transfer",
        hierarchical,
        bestItinerary: {
            type: "transfer",
            routingEngine:
                hierarchical.phase === "phase_1"
                    ? "phase_1"
                    : "raptor",
            departureTime,
            arrivalTime: hierarchical.finalArrivalTime,
            itinerary
        },
        failureReason: null
    };
}


function phase1Actions(connection, originLocation = null) {
    const actions = [];

    if (connection.accessWalk) {
        actions.push({
            type: "walk",
            kind: "origin_access",
            fromStopId: null,
            toStopId: connection.firstTrip.originBoardingStopId,
            fromLocation: originLocation
                ? { ...originLocation }
                : null,
            ...connection.accessWalk,
            durationSeconds: connection.accessWalk.walkingSeconds,
            distanceMetres: connection.accessWalk.walkingMetres
        });
    }

    actions.push({
        type: "transit",
        routeId: connection.firstTrip.routeId,
        tripId: connection.firstTrip.tripId,
        headsign: connection.firstTrip.headsign,
        routeType: connection.firstTrip.routeType ?? null,
        transitMode:
            String(connection.firstTrip.routeType) === "0" ? "train" : "bus",
        fromStopId: connection.firstTrip.originBoardingStopId,
        toStopId: connection.transfer.fromStopId,
        departureTime: connection.firstTrip.originDepartureTime,
        arrivalTime: connection.firstTrip.firstArrivalTime
    });
    actions.push({
        type: "walk",
        kind: "transfer",
        fromStopId: connection.transfer.fromStopId,
        toStopId: connection.transfer.toStopId,
        durationSeconds: connection.transfer.walkingSeconds,
        distanceMetres: connection.transfer.walkingMetres,
        encodedPolyline: connection.transfer.encodedPolyline,
        source: connection.transfer.source
    });
    actions.push({
        type: "transit",
        routeId: connection.secondTrip.routeId,
        tripId: connection.secondTrip.tripId,
        headsign: connection.secondTrip.headsign,
        routeType: connection.secondTrip.routeType ?? null,
        transitMode:
            String(connection.secondTrip.routeType) === "0" ? "train" : "bus",
        fromStopId: connection.transfer.toStopId,
        toStopId: connection.secondTrip.destinationStopId,
        departureTime: connection.secondTrip.secondDepartureTime,
        arrivalTime: connection.secondTrip.destinationArrivalTime
    });

    if (connection.finalWalk) {
        actions.push({
            type: "walk",
            kind: "destination_walk",
            fromStopId: connection.secondTrip.destinationStopId,
            toStopId: null,
            ...connection.finalWalk,
            durationSeconds: connection.finalWalk.walkingSeconds,
            distanceMetres: connection.finalWalk.walkingMetres
        });
    }

    return actions;
}


module.exports =
    planMultiStopTrip;
module.exports.normalizeWalkingActions = normalizeWalkingActions;
