/*
 * Gets coordinates for a location.
 *
 * First checks whether the location is already
 * an ETS stop in stopMap.
 *
 * If it isn't, Google Geocoding is used.
 */

async function getCoordinates(stopName, stopMap, {
    cache = null,
    apiKey = process.env.GOOGLE_GEOCODING_API_KEY,
    fetchImpl = globalThis.fetch
} = {}) {

    /*
     * stopMap now stores:
     *
     * stop name -> array of GTFS stop records
     *
     * Example:
     *
     * "West Edmonton Mall Transit Centre"
     *      -> [
     *          { stopId: "...", lat: ..., lon: ... },
     *          { stopId: "...", lat: ..., lon: ... },
     *          ...
     *         ]
     */
    const matchingStops =
        stopMap.get(stopName);


    /*
     * If this is already an ETS stop,
     * we do NOT need Google Geocoding.
     */
    if (
        matchingStops &&
        matchingStops.length > 0
    ) {

        /*
         * Multiple GTFS stop records may represent
         * different bays/platforms at the same
         * transit centre.
         *
         * For coordinate purposes, we can use the
         * coordinates of the first matching stop.
         *
         * Routing will still keep the individual
         * stop IDs separate later.
         */
        const firstStop =
            matchingStops[0];


        return {
            lat: firstStop.lat,
            lon: firstStop.lon
        };
    }


    /*
     * If the location isn't an ETS stop,
     * try Google Geocoding.
     */
    const cached = await cache?.get(stopName);
    if (cached) return cached;

    const params =
        new URLSearchParams({

            address: stopName,

            key: apiKey
        });


    const response =
        await fetchImpl(
            `https://maps.googleapis.com/maps/api/geocode/json?${params}`
        );


    const data =
        await response.json();


    /*
     * Google couldn't find the location.
     */
    if (
        data.status !== "OK" ||
        data.results.length === 0
    ) {

        return null;
    }


    /*
     * Extract coordinates from Google's response.
     */
    const location =
        data.results[0]
            .geometry
            .location;


    const coordinates = {

        lat: location.lat,

        lon: location.lng
    };

    await cache?.set(stopName, coordinates);
    return coordinates;
}


module.exports =
    getCoordinates;
