function createGeocodeCache({
    supabase,
    maximumAgeMilliseconds = 365 * 24 * 60 * 60 * 1000,
    logger = console
}) {
    async function get(address) {
        if (!supabase?.enabled) return null;
        try {
            return await supabase.getCache(cacheKey(address), "geocode");
        } catch (error) {
            logger.warn("Supabase geocode cache read failed:", error.message);
            return null;
        }
    }

    async function set(address, coordinates) {
        if (!supabase?.enabled) return;
        try {
            await supabase.setCache(
                cacheKey(address),
                "geocode",
                coordinates,
                new Date(Date.now() + maximumAgeMilliseconds).toISOString()
            );
        } catch (error) {
            logger.warn("Supabase geocode cache write failed:", error.message);
        }
    }

    return { get, set };
}

function cacheKey(address) {
    return `address:${String(address).trim().toLowerCase().replace(/\s+/g, " ")}`;
}

module.exports = { createGeocodeCache, cacheKey };
