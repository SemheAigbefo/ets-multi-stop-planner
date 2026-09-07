const { withinRadius, distanceMetres } = require("../../spatial/nearestStop");
const estimateWalking = require("../graph/estimateWalking");
const mergeItineraryActions = require("../graph/mergeItineraryActions");
const { gtfsTimeToSeconds, secondsToGtfsTime } = require("../graph/gtfsTime");
const { isTripEligibleForSearch } = require("../tripEligibility");


/* Stop-level, round-based public-transit routing. One round adds one boarding;
 * walking footpaths are relaxed after each transit round. */
function planRaptorJourney({
    originStopIds, destinationStopIds, originLocation = null,
    destinationLocation = null, departureTimeSeconds, travelDate, kdTree,
    stopById, tripsByRoute, stopTimesByTrip, serviceByDate,
    maximumBoardings = 5, minimumTransferSeconds = 300,
    maximumWaitSeconds = 7200, maximumJourneySeconds = 4 * 3600,
    maximumWalkingMetres = 600, walkingSpeedMetresPerSecond = 1.4,
    walkingDetourFactor = 1.2, allowedRouteTypes = null
}) {
    const start = Number(departureTimeSeconds);
    const activeServices = serviceByDate.get(travelDate);
    if (!activeServices) return failure("no_active_service", start);

    let previous = new Map();
    let marked = new Set();
    for (const idValue of originStopIds) {
        const id = String(idValue);
        const stop = stopById.get(id);
        if (!stop) continue;
        const walk = originLocation ? walkingBetween(originLocation, stop,
            walkingSpeedMetresPerSecond, walkingDetourFactor) : null;
        if (walk && walk.distanceMetres > maximumWalkingMetres) continue;
        const label = {
            stopId: id, arrivalTimeSeconds: start + (walk?.durationSeconds || 0),
            boardings: 0, walkingSeconds: walk?.durationSeconds || 0,
            previous: null,
            action: walk ? { type: "walk", kind: "origin_access",
                fromStopId: null, toStopId: id,
                fromLocation: { ...originLocation }, ...walk, estimated: true } : null
        };
        keepEarlier(previous, label) && marked.add(id);
    }

    const destinationIds = new Set(destinationStopIds.map(String));
    const destinationLabels = [];
    collectDestinations(previous, destinationIds, destinationLocation,
        stopById, maximumWalkingMetres, walkingSpeedMetresPerSecond,
        walkingDetourFactor, destinationLabels);

    let tripsScanned = 0;
    for (let round = 1; round <= maximumBoardings && marked.size; round++) {
        const current = new Map(previous);
        const routeIds = new Set();
        for (const stopId of marked) {
            for (const route of stopById.get(stopId)?.routes || []) {
                routeIds.add(String(route.routeId));
            }
        }
        const transitMarked = new Set();

        for (const routeId of routeIds) {
            for (const trip of tripsByRoute.get(routeId) || []) {
                tripsScanned++;
                if (!activeServices.has(trip.serviceId) ||
                    !isTripEligibleForSearch(trip, start)) continue;
                if (allowedRouteTypes &&
                    !allowedRouteTypes.includes(String(trip.routeType))) continue;
                const times = stopTimesByTrip.get(trip.tripId) || [];
                let boarded = null;
                for (let index = 0; index < times.length; index++) {
                    const time = times[index];
                    const atStop = previous.get(String(time.stopId));
                    const departure = gtfsTimeToSeconds(time.departureTime);
                    if (!boarded && atStop) {
                        const buffer = atStop.boardings ? minimumTransferSeconds : 0;
                        const wait = departure - atStop.arrivalTimeSeconds;
                        if (wait >= buffer && wait <= maximumWaitSeconds) {
                            boarded = { label: atStop, time, departure };
                        }
                    }
                    if (!boarded || index <= times.indexOf(boarded.time)) continue;
                    const arrival = gtfsTimeToSeconds(time.arrivalTime);
                    if (arrival - start > maximumJourneySeconds) continue;
                    const label = {
                        stopId: String(time.stopId), arrivalTimeSeconds: arrival,
                        boardings: round, walkingSeconds: boarded.label.walkingSeconds,
                        previous: boarded.label,
                        action: { type: "transit", routeId,
                            tripId: String(trip.tripId), headsign: trip.headsign || null,
                            routeType: trip.routeType ?? null,
                            transitMode:
                                String(trip.routeType) === "0" ? "train" : "bus",
                            fromStopId: String(boarded.time.stopId),
                            toStopId: String(time.stopId),
                            departureTime: boarded.time.departureTime,
                            arrivalTime: time.arrivalTime,
                            departureTimeSeconds: boarded.departure,
                            arrivalTimeSeconds: arrival }
                    };
                    keepEarlier(current, label) && transitMarked.add(label.stopId);
                }
            }
        }

        const nextMarked = new Set(transitMarked);
        if (kdTree) for (const stopId of transitMarked) {
            const from = stopById.get(stopId);
            const base = current.get(stopId);
            for (const candidate of withinRadius(kdTree, from.lat, from.lon,
                maximumWalkingMetres)) {
                const toId = String(candidate.stop.stopId);
                if (toId === stopId) continue;
                const walk = estimateWalking(candidate.distanceMetres, {
                    walkingSpeedMetresPerSecond, detourFactor: walkingDetourFactor
                });
                if (walk.distanceMetres > maximumWalkingMetres) continue;
                const label = { stopId: toId,
                    arrivalTimeSeconds: base.arrivalTimeSeconds + walk.durationSeconds,
                    boardings: round,
                    walkingSeconds: base.walkingSeconds + walk.durationSeconds,
                    previous: base, action: { type: "walk", kind: "transfer",
                        fromStopId: stopId, toStopId: toId, ...walk, estimated: true } };
                keepEarlier(current, label) && nextMarked.add(toId);
            }
        }
        collectDestinations(current, destinationIds, destinationLocation,
            stopById, maximumWalkingMetres, walkingSpeedMetresPerSecond,
            walkingDetourFactor, destinationLabels);
        previous = current;
        marked = nextMarked;
    }

    if (!destinationLabels.length) return failure("destination_unreachable", start);
    destinationLabels.sort((a, b) => a.arrivalTimeSeconds - b.arrivalTimeSeconds ||
        a.boardings - b.boardings || a.walkingSeconds - b.walkingSeconds);
    const candidateJourneys = [];
    const itineraryKeys = new Set();
    for (const label of destinationLabels) {
        const candidate = journeyFromLabel(label, start, tripsScanned,
            destinationLabels.length, maximumBoardings);
        const key = candidate.itinerary.map(action => [action.type,
            action.tripId || "", action.fromStopId, action.toStopId].join("|"))
            .join(">");
        if (itineraryKeys.has(key)) continue;
        itineraryKeys.add(key);
        candidateJourneys.push(candidate);
        if (candidateJourneys.length >= 10) break;
    }
    return { ...candidateJourneys[0], candidateJourneys };
}

function journeyFromLabel(
    label,
    start,
    tripsScanned,
    destinationLabelCount,
    maximumBoardings
) {
    const actions = reconstruct(label);
    return { success: true, routingEngine: "raptor", departureTimeSeconds: start,
        departureTime: secondsToGtfsTime(start),
        arrivalTimeSeconds: label.arrivalTimeSeconds,
        arrivalTime: secondsToGtfsTime(label.arrivalTimeSeconds),
        boardings: label.boardings, walkingSeconds: label.walkingSeconds,
        actions, itinerary: mergeItineraryActions(actions),
        statistics: { rounds: maximumBoardings, tripsScanned,
            destinationLabels: destinationLabelCount } };
}

function keepEarlier(map, label) {
    const old = map.get(label.stopId);
    if (old && old.arrivalTimeSeconds <= label.arrivalTimeSeconds) return false;
    map.set(label.stopId, label); return true;
}
function walkingBetween(a, b, speed, factor) {
    return estimateWalking(distanceMetres(a.lat, a.lon, b.lat, b.lon),
        { walkingSpeedMetresPerSecond: speed, detourFactor: factor });
}
function collectDestinations(labels, ids, location, stopById, maxWalk, speed, factor, out) {
    for (const id of ids) {
        const base = labels.get(id); if (!base) continue;
        if (!location) { out.push(base); continue; }
        const stop = stopById.get(id); if (!stop) continue;
        const walk = walkingBetween(stop, location, speed, factor);
        if (walk.distanceMetres > maxWalk) continue;
        out.push({ stopId: "__destination__",
            arrivalTimeSeconds: base.arrivalTimeSeconds + walk.durationSeconds,
            boardings: base.boardings,
            walkingSeconds: base.walkingSeconds + walk.durationSeconds,
            previous: base, action: { type: "walk", kind: "destination_walk",
                fromStopId: id, toStopId: null, toLocation: { ...location },
                ...walk, estimated: true } });
    }
}
function reconstruct(label) {
    const actions = []; let cursor = label;
    while (cursor) { if (cursor.action) actions.push(cursor.action); cursor = cursor.previous; }
    return actions.reverse();
}
function failure(reason, start) {
    return { success: false, routingEngine: "raptor", reason,
        departureTimeSeconds: start, itinerary: [], actions: [] };
}

module.exports = planRaptorJourney;
