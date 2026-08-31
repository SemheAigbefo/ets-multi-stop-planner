const ROUTES_ENDPOINT =
    "https://routes.googleapis.com/directions/v2:computeRoutes";


function parseGoogleDuration(duration) {
    const match = String(duration || "").match(/^([0-9]+(?:\.[0-9]+)?)s$/);

    if (!match) {
        throw new Error(`Invalid Google route duration: ${duration}`);
    }

    return Math.ceil(Number(match[1]));
}


/* Requests one accurate pedestrian route between two physical stops. */
async function getGoogleWalkingRoute({
    origin,
    destination,
    apiKey = process.env.GOOGLE_ROUTES_API_KEY,
    fetchImpl = globalThis.fetch
}) {
    if (!apiKey) {
        throw new Error("GOOGLE_ROUTES_API_KEY is not configured.");
    }

    if (typeof fetchImpl !== "function") {
        throw new TypeError("A fetch implementation is required.");
    }

    const originLat = Number(origin?.lat);
    const originLon = Number(origin?.lon);
    const destinationLat = Number(destination?.lat);
    const destinationLon = Number(destination?.lon);

    if (
        !Number.isFinite(originLat) ||
        !Number.isFinite(originLon) ||
        !Number.isFinite(destinationLat) ||
        !Number.isFinite(destinationLon)
    ) {
        throw new TypeError(
            "Walking-route endpoints require valid coordinates."
        );
    }

    const response = await fetchImpl(ROUTES_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": [
                "routes.duration",
                "routes.distanceMeters",
                "routes.polyline.encodedPolyline"
            ].join(",")
        },
        body: JSON.stringify({
            origin: {
                location: {
                    latLng: {
                        latitude: originLat,
                        longitude: originLon
                    }
                }
            },
            destination: {
                location: {
                    latLng: {
                        latitude: destinationLat,
                        longitude: destinationLon
                    }
                }
            },
            travelMode: "WALK",
            computeAlternativeRoutes: false,
            languageCode: "en-CA",
            units: "METRIC"
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message ||
            `Google Routes request failed with status ${response.status}.`
        );
    }

    const route = data.routes?.[0];

    if (!route) {
        throw new Error("Google Routes returned no pedestrian route.");
    }

    return {
        distanceMetres: Number(route.distanceMeters),
        durationSeconds: parseGoogleDuration(route.duration),
        encodedPolyline: route.polyline?.encodedPolyline || null,
        verified: true,
        source: "google_routes"
    };
}


module.exports = {
    getGoogleWalkingRoute,
    parseGoogleDuration,
    ROUTES_ENDPOINT
};
