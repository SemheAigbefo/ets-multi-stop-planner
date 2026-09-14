function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const appConfig = Object.freeze({
    server: Object.freeze({
        port: positiveNumber(process.env.PORT, 3000),
        host: process.env.HOST || "127.0.0.1"
    }),
    endpoints: Object.freeze({
        searchRadiusMetres: positiveNumber(
            process.env.ENDPOINT_SEARCH_RADIUS_METRES,
            600
        ),
        maximumStops: positiveNumber(process.env.ENDPOINT_MAXIMUM_STOPS, 20)
    }),
    walking: Object.freeze({
        maximumSegmentMetres: positiveNumber(
            process.env.MAXIMUM_WALKING_METRES,
            1200
        ),
        maximumTotalMetres: positiveNumber(
            process.env.MAXIMUM_TOTAL_WALKING_METRES,
            3600
        )
    }),
    transit: Object.freeze({
        minimumTransferMinutes: positiveNumber(
            process.env.MINIMUM_TRANSFER_MINUTES,
            5
        ),
        maximumBoardings: positiveNumber(process.env.RAPTOR_MAXIMUM_BOARDINGS, 5),
        maximumCandidates: positiveNumber(process.env.RAPTOR_MAXIMUM_CANDIDATES, 10),
        maximumWalkingRetries: positiveNumber(process.env.RAPTOR_WALKING_RETRIES, 3)
    }),
    realtime: Object.freeze({
        vehiclePositionsUrl: process.env.ETS_VEHICLE_POSITIONS_URL ||
            "https://gtfs.edmonton.ca/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb",
        cacheMilliseconds: positiveNumber(process.env.REALTIME_CACHE_MILLISECONDS, 10000),
        browserRefreshSeconds: positiveNumber(process.env.REALTIME_REFRESH_SECONDS, 15)
    }),
    services: Object.freeze({
        googleGeocodingApiKey: process.env.GOOGLE_GEOCODING_API_KEY || null,
        googleRoutesApiKey: process.env.GOOGLE_ROUTES_API_KEY || null,
        orsApiKey: process.env.ORS_API_KEY || null,
        orsMatrixUrl: process.env.ORS_MATRIX_URL || null,
        supabaseUrl: process.env.SUPABASE_URL || null,
        supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null
    })
});

module.exports = appConfig;
