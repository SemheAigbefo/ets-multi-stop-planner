const fs = require("node:fs");
const path = require("node:path");


function createWalkingRouteCache({
    filePath = path.join(
        __dirname,
        "../../../data/cache/walkingRoutes.json"
    ),
    maximumAgeMilliseconds = 180 * 24 * 60 * 60 * 1000
} = {}) {
    let loaded = false;
    let data = { version: 1, routes: {} };

    function load() {
        if (loaded) return;
        loaded = true;

        try {
            data = JSON.parse(fs.readFileSync(filePath, "utf8"));
            data.routes ||= {};
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }

    function get(origin, destination) {
        load();
        const key = routeKey(origin, destination);
        const entry = data.routes[key];

        if (!entry) return null;

        if (
            Date.now() - new Date(entry.verifiedAt).getTime() >
            maximumAgeMilliseconds
        ) {
            return null;
        }

        return { ...entry.route, source: "google_routes_cache" };
    }

    function set(origin, destination, route) {
        load();
        const key = routeKey(origin, destination);
        data.routes[key] = {
            origin: endpointKey(origin),
            destination: endpointKey(destination),
            verifiedAt: new Date().toISOString(),
            route: {
                distanceMetres: route.distanceMetres,
                durationSeconds: route.durationSeconds,
                encodedPolyline: route.encodedPolyline || null,
                verified: true,
                source: "google_routes"
            }
        };
        persist();
    }

    function persist() {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const temporaryPath = `${filePath}.tmp`;
        fs.writeFileSync(
            temporaryPath,
            `${JSON.stringify(data, null, 2)}\n`,
            "utf8"
        );
        fs.renameSync(temporaryPath, filePath);
    }

    return { get, set, filePath };
}


function endpointKey(endpoint) {
    if (endpoint?.stopId !== undefined && endpoint.stopId !== null) {
        return `stop:${endpoint.stopId}`;
    }

    return [
        "coord",
        Number(endpoint?.lat).toFixed(6),
        Number(endpoint?.lon).toFixed(6)
    ].join(":");
}


function routeKey(origin, destination) {
    return `${endpointKey(origin)}>${endpointKey(destination)}`;
}


module.exports = {
    createWalkingRouteCache,
    endpointKey,
    routeKey
};
