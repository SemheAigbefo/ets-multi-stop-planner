/*
 * Follows predecessor references from a finalized destination state back
 * to the origin, then reverses the result into user travel order.
 */
function reconstructStates(destinationState) {
    if (!destinationState) {
        return [];
    }

    const reversed = [];
    const seen = new Set();
    let current = destinationState;

    while (current) {
        if (seen.has(current)) {
            throw new Error("A cycle exists in the predecessor chain.");
        }

        seen.add(current);
        reversed.push(current);
        current = current.previousState;
    }

    return reversed.reverse();
}


/* Returns only journey actions, excluding the actionless origin state. */
function reconstructActions(destinationState) {
    return reconstructStates(destinationState)
        .filter(state => state.action)
        .map(state => state.action);
}


module.exports = {
    reconstructStates,
    reconstructActions
};
