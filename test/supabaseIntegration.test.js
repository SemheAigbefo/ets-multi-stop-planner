const assert = require("node:assert/strict");
const createSupabaseClient = require("../src/services/createSupabaseClient");
const createPersistentWalkingRouteCache =
    require("../src/routing/cache/createPersistentWalkingRouteCache");
const { createGeocodeCache, cacheKey } =
    require("../src/geocode/createGeocodeCache");

async function run() {
    const requests = [];
    const fetchImpl = async (url, options = {}) => {
        requests.push({ url, options });
        if (options.method === "POST") {
            return { ok: true, status: 201, text: async () => "" };
        }
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify([{
                response_data: { durationSeconds: 60, distanceMetres: 80 },
                expires_at: new Date(Date.now() + 60000).toISOString()
            }])
        };
    };
    const supabase = createSupabaseClient({
        url: "https://example.supabase.co/",
        serviceRoleKey: "server-secret",
        fetchImpl
    });
    assert.equal(supabase.enabled, true);
    const remote = await supabase.getCache("A>B", "walking_route");
    assert.equal(remote.distanceMetres, 80);
    assert.match(requests[0].url, /\/rest\/v1\/api_cache\?/);
    assert.equal(requests[0].options.headers.apikey, "server-secret");

    const localValues = new Map();
    const localCache = {
        get: (a, b) => localValues.get(`${a.stopId}>${b.stopId}`) || null,
        set: (a, b, route) => localValues.set(`${a.stopId}>${b.stopId}`, route)
    };
    const cache = createPersistentWalkingRouteCache({ localCache, supabase });
    const origin = { stopId: "A" };
    const destination = { stopId: "B" };
    assert.equal((await cache.get(origin, destination)).source, "supabase_cache");
    await cache.set(origin, destination, {
        durationSeconds: 70,
        distanceMetres: 90,
        encodedPolyline: "abc"
    });
    assert.equal(localValues.get("A>B").distanceMetres, 90);
    assert.equal(requests.at(-1).options.method, "POST");

    await supabase.submitIssue({
        category: "routing",
        description: "Test issue",
        origin: "Origin",
        destinations: ["Destination"]
    });
    assert.match(requests.at(-1).url, /\/rest\/v1\/issue_reports$/);
    assert.match(requests.at(-1).options.body, /\"origin\":\"Origin\"/);

    const geocodeCache = createGeocodeCache({ supabase });
    const geocode = await geocodeCache.get("  2749  Orchards Rd SW ");
    assert.equal(geocode.distanceMetres, 80);
    assert.equal(cacheKey("  2749  Orchards Rd SW "), "address:2749 orchards rd sw");
    await geocodeCache.set("2749 Orchards Rd SW", { lat: 53.4, lon: -113.45 });
    assert.match(requests.at(-1).options.body, /\"cache_type\":\"geocode\"/);

    const disabled = createSupabaseClient();
    assert.equal(disabled.enabled, false);
    assert.equal(await disabled.getCache("x", "walking_route"), null);
    console.log("Supabase integration tests passed.");
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
