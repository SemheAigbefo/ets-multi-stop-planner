const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    createWalkingRouteCache
} = require("../src/routing/cache/createWalkingRouteCache");
const getTransferBufferSeconds =
    require("../src/routing/transitCentres/getTransferBufferSeconds");


const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "ets-walking-cache-")
);
const filePath = path.join(temporaryDirectory, "walking.json");
const origin = { stopId: "4214", lat: 53.45, lon: -113.51 };
const destination = { stopId: "4215", lat: 53.46, lon: -113.52 };

try {
    const firstCache = createWalkingRouteCache({ filePath });
    assert.equal(firstCache.get(origin, destination), null);

    firstCache.set(origin, destination, {
        durationSeconds: 25,
        distanceMetres: 29,
        encodedPolyline: "century-walk"
    });

    const reloadedCache = createWalkingRouteCache({ filePath });
    const cached = reloadedCache.get(origin, destination);

    assert.equal(cached.durationSeconds, 25);
    assert.equal(cached.distanceMetres, 29);
    assert.equal(cached.source, "google_routes_cache");
    assert.equal(reloadedCache.get(destination, origin), null);

    assert.equal(getTransferBufferSeconds({
        centreId: "century-park-transit-centre",
        fromStopId: "4214",
        toStopId: "4215"
    }), 180);
    assert.equal(getTransferBufferSeconds({
        centreId: "mill-woods-transit-centre",
        fromStopId: "A",
        toStopId: "B"
    }), 300);
    assert.equal(getTransferBufferSeconds({
        centreId: "mill-woods-transit-centre",
        fromStopId: "A",
        toStopId: "A"
    }), 60);

    console.log("Walking-route cache and transfer-buffer tests passed.");
} finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
