async function getGoogleTransitRoutes(
    origin,
    destination,
    departureDateTime
) {
    const response = await fetch(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json",

                "X-Goog-Api-Key":
                    process.env
                        .GOOGLE_ROUTES_API_KEY,

                "X-Goog-FieldMask": [
                    "routes.duration",
                    "routes.distanceMeters",
                    "routes.localizedValues",
                    "routes.legs.steps.travelMode",
                    "routes.legs.steps.distanceMeters",
                    "routes.legs.steps.staticDuration",
                    "routes.legs.steps.navigationInstruction",
                    "routes.legs.steps.transitDetails"
                ].join(",")
            },

            body: JSON.stringify({
                origin: {
                    location: {
                        latLng: {
                            latitude:
                                Number(origin.lat),

                            longitude:
                                Number(origin.lon)
                        }
                    }
                },

                destination: {
                    location: {
                        latLng: {
                            latitude:
                                Number(destination.lat),

                            longitude:
                                Number(destination.lon)
                        }
                    }
                },

                travelMode:
                    "TRANSIT",

                departureTime:
                    departureDateTime,

                computeAlternativeRoutes:
                    true,

                transitPreferences: {
                    allowedTravelModes: [
                        "BUS",
                        "LIGHT_RAIL"
                    ],

                    routingPreference:
                        "FEWER_TRANSFERS"
                },

                languageCode:
                    "en-CA",

                units:
                    "METRIC"
            })
        }
    );


    const data =
        await response.json();


    if (!response.ok) {
        console.error(
            "Google Routes error:",
            data
        );

        throw new Error(
            data.error?.message ||
            "Google Routes request failed"
        );
    }


    return data.routes || [];
}


module.exports =
    getGoogleTransitRoutes;