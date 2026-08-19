/*Make searching faster  with hashmap*/
/* map is like a dictionary where the key can be any datatype, i.e func, obj and primitives */
const {
    insert
} = require("../spatial/nearestStop");
function buildIndexes(stops){
const stopMap = new Map();
let kdTree = null;
for (const stop of stops) { /*for stop in list of stops */
    const {name,stopId, lat, lon, routes} = stop;
    stopMap.set(name, {stopId, lat, lon, routes}); /*stop is an ojcet from stopRouteJoin.json , map is a key value pair */

 kdTree = insert(
            kdTree,
            stop
        );
    }
    return {
        stopMap,
        kdTree
    };
}

module.exports = buildIndexes;