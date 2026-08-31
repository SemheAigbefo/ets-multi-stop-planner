const planLeg =
    require("./planLeg");


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
    if (itinerary.routingEngine === "time_dependent_graph") {
        return itinerary.arrivalTime;
    }

    if (itinerary.type === "direct") {
        return itinerary.arrivalTime;
    }

    return itinerary.finalArrivalTime;
}


function getActualDepartureTime(itinerary) {
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
    fetchImpl
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

        /*
         * The initial origin uses the trip's requested
         * start time. Later origins may have an optional
         * user departure-time preference.
         */
        const preferredDepartureTime =
            index === 0
                ? initialDepartureTime
                : origin.preferredDepartureTime;

        const {
            effectiveDepartureTime,
            preferenceStatus
        } = chooseDepartureTime(
            earliestAvailableTime,
            preferredDepartureTime
        );

        const legResult =
            await planLeg({
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
                transitOptions,
                searchOptions,
                verifyWalking,
                googleRoutesApiKey,
                fetchImpl
            });

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

        const arrivalTime =
            getArrivalTime(
                legResult.bestItinerary
            );

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


module.exports =
    planMultiStopTrip;
