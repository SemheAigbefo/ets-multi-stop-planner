// KD Tree implementation adapted for the ETS Transit Planner
// Original approach contributed by Amit Mangal

// Number of dimensions
const k = 2;


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


module.exports = {
    Node,
    insert,
    nearest
};