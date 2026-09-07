const assert = require("node:assert/strict");
const {
    isOwlTrip,
    isDaytime,
    isTripEligibleForSearch
} = require("../src/routing/tripEligibility");


const daytimeNine = { headsign: "9 Southgate" };
const owlToCentury = { headsign: "9-Owl Century Park" };
const owlToEauxClaires = { headsign: "9-Owl Eaux Claires" };

assert.equal(isOwlTrip(daytimeNine), false);
assert.equal(isOwlTrip(owlToCentury), true);
assert.equal(isOwlTrip(owlToEauxClaires), true);

assert.equal(isDaytime(12 * 3600), true);
assert.equal(isDaytime(21 * 3600 + 59 * 60), true);
assert.equal(isDaytime(22 * 3600), false);
assert.equal(isDaytime(25 * 3600), false);

assert.equal(isTripEligibleForSearch(daytimeNine, 12 * 3600), true);
assert.equal(isTripEligibleForSearch(owlToCentury, 12 * 3600), false);
assert.equal(isTripEligibleForSearch(owlToEauxClaires, 12 * 3600), false);
assert.equal(isTripEligibleForSearch(owlToCentury, 23 * 3600), true);
assert.equal(isTripEligibleForSearch(owlToEauxClaires, 25 * 3600), true);

console.log("Trip eligibility tests passed.");
