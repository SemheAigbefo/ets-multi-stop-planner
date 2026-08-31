// KD Tree implementation adapted for the ETS Transit Planner
// Original approach contributed by Amit Mangal

// Number of dimensions
const k = 2;

// Mean Earth radius used by the Haversine calculation.
const EARTH_RADIUS_METRES = 6371008.8;


// Represents one node in the KD tree
class Node {
    constructor(stop) {
        this.stop = stop;

        // Coordinates used for KD-tree comparisons
        this.point = [stop.lat, stop.lon];

        this.left = null;
        this.right = null;
    }
}


// Creates a new KD-tree node
function newNode(stop) {
    return new Node(stop);
}


// Inserts a stop into the KD tree
function insertRec(root, stop, depth) {

    // Tree is empty
    if (!root) {
        return newNode(stop);
    }

    // 0 = latitude
    // 1 = longitude
    const cd = depth % k;

    const coordinate = cd === 0
        ? stop.lat
        : stop.lon;

    const rootCoordinate = root.point[cd];

    if (coordinate < rootCoordinate) {
        root.left = insertRec(
            root.left,
            stop,
            depth + 1
        );
    } else {
        root.right = insertRec(
            root.right,
            stop,
            depth + 1
        );
    }

    return root;
}


// Inserts a stop into the KD tree
function insert(root, stop) {
    return insertRec(root, stop, 0);
}


// Calculates squared distance between two coordinates
function distanceSquared(point1, point2) {

    const latDifference =
        point1[0] - point2[0];

    const lonDifference =
        point1[1] - point2[1];

    return (
        latDifference * latDifference +
        lonDifference * lonDifference
    );
}


function toRadians(degrees) {
    return degrees * Math.PI / 180;
}


/* Straight-line surface distance suitable for walking limits. */
function distanceMetres(lat1, lon1, lat2, lon2) {
    const latitudeDifference = toRadians(lat2 - lat1);
    const longitudeDifference = toRadians(lon2 - lon1);
    const firstLatitude = toRadians(lat1);
    const secondLatitude = toRadians(lat2);

    const haversine =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.sin(longitudeDifference / 2) ** 2;

    return 2 * EARTH_RADIUS_METRES * Math.asin(
        Math.min(1, Math.sqrt(haversine))
    );
}


// Searches for the nearest stop
function nearestRec(root, target, depth, best) {

    // No node
    if (!root) {
        return best;
    }

    const currentDistance = distanceSquared(
        root.point,
        target
    );

    // Is this stop closer?
    if (currentDistance < best.distance) {
        best.stop = root.stop;
        best.distance = currentDistance;
    }

    // Determine which axis we're splitting on
    const cd = depth % k;

    let nearBranch;
    let farBranch;

    if (target[cd] < root.point[cd]) {
        nearBranch = root.left;
        farBranch = root.right;
    } else {
        nearBranch = root.right;
        farBranch = root.left;
    }

    // Search the closer side first
    nearestRec(
        nearBranch,
        target,
        depth + 1,
        best
    );

    /*
     * Check whether the opposite branch could
     * possibly contain a closer stop.
     */
    const difference =
        target[cd] - root.point[cd];

    if (difference * difference < best.distance) {

        nearestRec(
            farBranch,
            target,
            depth + 1,
            best
        );
    }

    return best;
}


// Finds the nearest ETS stop
function nearest(root, lat, lon) {

    const target = [lat, lon];

    const best = {
        stop: null,
        distance: Infinity
    };

    nearestRec(
        root,
        target,
        0,
        best
    );

    return best;
}


/* Finds every physical stop inside the requested radius. */
function withinRadiusRec(root, target, radiusMetres, depth, matches) {
    if (!root) {
        return;
    }

    const [targetLat, targetLon] = target;
    const currentDistance = distanceMetres(
        targetLat,
        targetLon,
        Number(root.point[0]),
        Number(root.point[1])
    );

    if (currentDistance <= radiusMetres) {
        matches.push({
            stop: root.stop,
            distanceMetres: currentDistance
        });
    }

    const cd = depth % k;
    const differenceDegrees =
        target[cd] - Number(root.point[cd]);
    const nearBranch = differenceDegrees < 0
        ? root.left
        : root.right;
    const farBranch = differenceDegrees < 0
        ? root.right
        : root.left;

    withinRadiusRec(
        nearBranch,
        target,
        radiusMetres,
        depth + 1,
        matches
    );

    /* Convert distance from the KD split plane into metres. */
    const metresPerDegree = cd === 0
        ? 111320
        : 111320 * Math.max(
            0.01,
            Math.cos(toRadians(targetLat))
        );

    if (
        Math.abs(differenceDegrees) * metresPerDegree <=
        radiusMetres
    ) {
        withinRadiusRec(
            farBranch,
            target,
            radiusMetres,
            depth + 1,
            matches
        );
    }
}


/* Returns nearby stops ordered from closest to farthest. */
function withinRadius(root, lat, lon, radiusMetres) {
    const numericLat = Number(lat);
    const numericLon = Number(lon);
    const numericRadius = Number(radiusMetres);

    if (
        !Number.isFinite(numericLat) ||
        !Number.isFinite(numericLon) ||
        !Number.isFinite(numericRadius) ||
        numericRadius < 0
    ) {
        throw new TypeError(
            "withinRadius requires valid coordinates and a non-negative radius"
        );
    }

    const matches = [];

    withinRadiusRec(
        root,
        [numericLat, numericLon],
        numericRadius,
        0,
        matches
    );

    matches.sort(
        (a, b) => a.distanceMetres - b.distanceMetres
    );

    return matches;
}


module.exports = {
    Node,
    insert,
    nearest,
    withinRadius,
    distanceMetres
};
