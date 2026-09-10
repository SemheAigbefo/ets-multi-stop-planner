const assert = require("node:assert/strict");
const { ServiceCalendar, dayTypeForDate } =
    require("../src/data/ServiceCalendar");

const calendar = new ServiceCalendar();
calendar.set("20260628", new Set(["SU-001-Sunday"]));
calendar.set("20260701", new Set(["SU-001-Sunday"])); // Wednesday holiday
calendar.set("20260703", new Set(["DX-001-Weekday"]));
calendar.set("20260704", new Set(["SA-001-Saturday"]));
calendar.buildFallbacks();

assert.equal(dayTypeForDate("20260910"), "weekday");
assert.equal(dayTypeForDate("20260912"), "saturday");
assert.equal(dayTypeForDate("20260913"), "sunday");
assert.deepEqual([...calendar.get("20260701")], ["SU-001-Sunday"]);
assert.deepEqual([...calendar.get("20260910")], ["DX-001-Weekday"]);
assert.deepEqual([...calendar.get("20260912")], ["SA-001-Saturday"]);
assert.deepEqual([...calendar.get("20260913")], ["SU-001-Sunday"]);
assert.deepEqual(calendar.resolutionFor("20260910"), {
    requestedDate: "20260910", sourceDate: "20260703",
    dayType: "weekday", exact: false
});
console.log("Service calendar fallback tests passed.");
