async function getCoordinates(stopName, stopMap) {

    const result = stopMap.get(stopName);

    if (result) {
        console.log("Found in ETS:", stopName);
        return result;
    }

    console.log("Not an ETS stop. Trying Google:", stopName);

    const params = new URLSearchParams({
        address: stopName,
        key: process.env.GOOGLE_GEOCODING_API_KEY
    });

    const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${params}`
    );

    console.log("HTTP status:", response.status);

    const data = await response.json();

    console.log("Google response:", data);

    if (data.status !== "OK" || data.results.length === 0) {
        return null;
    }

    const location = data.results[0].geometry.location;

    return {
        lat: location.lat,
        lon: location.lng
    };
}

module.exports = getCoordinates;