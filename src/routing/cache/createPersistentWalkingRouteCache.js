const { endpointKey, routeKey } = require("./createWalkingRouteCache");

function createPersistentWalkingRouteCache({
    localCache,
    supabase,
    maximumAgeMilliseconds = 180 * 24 * 60 * 60 * 1000,
    logger = console
}) {
    async function get(origin, destination) {
        const local = localCache?.get(origin, destination);
        if (local) return local;
        if (!supabase?.enabled) return null;
        try {
            const route = await supabase.getCache(
                routeKey(origin, destination),
                "walking_route"
            );
            return route ? { ...route, source: "supabase_cache" } : null;
        } catch (error) {
            logger.warn("Supabase cache read failed:", error.message);
            return null;
        }
    }

    async function set(origin, destination, route) {
        localCache?.set(origin, destination, route);
        if (!supabase?.enabled) return;
        try {
            await supabase.setCache(
                routeKey(origin, destination),
                "walking_route",
                {
                    origin: endpointKey(origin),
                    destination: endpointKey(destination),
                    distanceMetres: route.distanceMetres,
                    durationSeconds: route.durationSeconds,
                    encodedPolyline: route.encodedPolyline || null,
                    verified: true,
                    source: "google_routes"
                },
                new Date(Date.now() + maximumAgeMilliseconds).toISOString()
            );
        } catch (error) {
            logger.warn("Supabase cache write failed:", error.message);
        }
    }

    return { get, set };
}

module.exports = createPersistentWalkingRouteCache;
