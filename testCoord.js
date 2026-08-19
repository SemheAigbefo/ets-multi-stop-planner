require("dotenv").config();
console.log("Environment variables:", Object.keys(process.env));
console.log(
    "Key loaded:",
    process.env.GOOGLE_GEOCODING_API_KEY ? "YES" : "NO"
);

const stops =
    require("./data/processed/stopsRouteJoin.json");

const buildIndexes =
    require("./src/data/buildIndexes");

const getCoordinates =
    require("./src/geocode/coordFun");

const {
    nearest
} = require("./src/spatial/nearestStop");


const {
    stopMap,
    kdTree
} = buildIndexes(stops);


async function test() {

    // ============================
    // TEST GOOGLE / COORDINATES
    // ============================

    const coordinates =
        await getCoordinates(
            "West Edmonton Mall",
            stopMap
        );

    console.log(
        "Coordinates:",
        coordinates
    );


    // ============================
    // TEST KD TREE
    // ============================

    const closestStop = nearest(
    kdTree,
    coordinates.lat,
    coordinates.lon
);

console.log("Closest ETS stop:", closestStop.stop);
console.log("KD-tree distance:", closestStop.distance);
}


test();