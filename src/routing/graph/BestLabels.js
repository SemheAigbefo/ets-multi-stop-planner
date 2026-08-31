/*
 * Returns true when first is at least as good as second in every tracked
 * cost and strictly better in one. Such a state makes the second state
 * unnecessary because it has no advantage for future expansion.
 */
function dominates(first, second) {
    const noWorse =
        first.arrivalTimeSeconds <= second.arrivalTimeSeconds &&
        first.transfers <= second.transfers &&
        first.walkingSeconds <= second.walkingSeconds &&
        first.walkingMetres <= second.walkingMetres;

    const strictlyBetter =
        first.arrivalTimeSeconds < second.arrivalTimeSeconds ||
        first.transfers < second.transfers ||
        first.walkingSeconds < second.walkingSeconds ||
        first.walkingMetres < second.walkingMetres;

    return noWorse && strictlyBetter;
}


function hasEqualCosts(first, second) {
    return first.arrivalTimeSeconds === second.arrivalTimeSeconds &&
        first.transfers === second.transfers &&
        first.walkingSeconds === second.walkingSeconds &&
        first.walkingMetres === second.walkingMetres;
}


/*
 * Stores the non-dominated labels for each relevant search position.
 *
 * The default key distinguishes an off-board state from a state currently
 * riding a particular trip. That distinction matters because staying on a
 * vehicle can reach downstream stops without another boarding.
 */
class BestLabels {
    constructor(
        getKey = state =>
            `${state.stopId}|${state.tripId || "offboard"}`
    ) {
        if (typeof getKey !== "function") {
            throw new TypeError("getKey must be a function.");
        }

        this.getKey = getKey;
        this.labelsByKey = new Map();
    }

    get size() {
        let count = 0;

        for (const labels of this.labelsByKey.values()) {
            count += labels.length;
        }

        return count;
    }

    labelsFor(stateOrKey) {
        const key = typeof stateOrKey === "string"
            ? stateOrKey
            : this.getKey(stateOrKey);

        return [...(this.labelsByKey.get(key) || [])];
    }

    /*
     * Records a useful state and removes labels it dominates.
     * Returns true only when the caller should add the state to the frontier.
     */
    accept(state) {
        const key = this.getKey(state);
        const existing = this.labelsByKey.get(key) || [];

        if (
            existing.some(
                label =>
                    dominates(label, state) ||
                    hasEqualCosts(label, state)
            )
        ) {
            return false;
        }

        const remaining = existing.filter(
            label => !dominates(state, label)
        );

        remaining.push(state);
        this.labelsByKey.set(key, remaining);

        return true;
    }

    /* A queued state can become stale after a better label is accepted. */
    isCurrent(state) {
        const labels = this.labelsByKey.get(
            this.getKey(state)
        ) || [];

        return labels.includes(state);
    }
}


module.exports = {
    BestLabels,
    dominates
};
