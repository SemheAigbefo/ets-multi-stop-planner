const GtfsRealtimeBindings = require("gtfs-realtime-bindings");


function registerRealtimeRoutes({ app, config, fetchImpl = globalThis.fetch }) {
    let vehicleFeedCache = { fetchedAt: 0, vehicles: [] };

    app.get("/api/realtime/vehicles", async (req, res) => {
        try {
            const requestedTrips = new Set(
                String(req.query.tripIds || "").split(",").filter(Boolean)
            );
            const now = Date.now();

            if (now - vehicleFeedCache.fetchedAt > config.cacheMilliseconds) {
                const response = await fetchImpl(config.vehiclePositionsUrl);
                if (!response.ok) {
                    throw new Error(`ETS live feed returned ${response.status}`);
                }
                const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage
                    .decode(new Uint8Array(await response.arrayBuffer()));
                vehicleFeedCache = {
                    fetchedAt: now,
                    vehicles: feed.entity
                        .filter(entity => entity.vehicle?.position)
                        .map(entity => ({
                            vehicleId: String(entity.vehicle.vehicle?.id || entity.id),
                            label: entity.vehicle.vehicle?.label || null,
                            tripId: String(entity.vehicle.trip?.tripId || ""),
                            routeId: String(entity.vehicle.trip?.routeId || ""),
                            latitude: Number(entity.vehicle.position.latitude),
                            longitude: Number(entity.vehicle.position.longitude),
                            bearing: Number(entity.vehicle.position.bearing || 0),
                            timestamp: Number(entity.vehicle.timestamp || 0)
                        }))
                };
            }

            const vehicles = requestedTrips.size
                ? vehicleFeedCache.vehicles.filter(vehicle =>
                    requestedTrips.has(vehicle.tripId))
                : [];
            res.json({
                success: true,
                fetchedAt: vehicleFeedCache.fetchedAt,
                refreshAfterSeconds: config.browserRefreshSeconds,
                vehicles
            });
        } catch (error) {
            res.status(503).json({
                success: false,
                error: "ETS real-time vehicle positions are temporarily unavailable."
            });
        }
    });
}


module.exports = registerRealtimeRoutes;
