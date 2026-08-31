/* GTFS permits hours greater than 23 for service after midnight. */
function gtfsTimeToSeconds(time) {
    if (typeof time !== "string") {
        throw new TypeError("GTFS time must be a string.");
    }

    const parts = time.split(":").map(Number);

    if (
        parts.length < 2 ||
        parts.length > 3 ||
        parts.some(value => !Number.isFinite(value))
    ) {
        throw new TypeError(`Invalid GTFS time: ${time}`);
    }

    const [hours, minutes, seconds = 0] = parts;

    if (
        hours < 0 ||
        minutes < 0 || minutes > 59 ||
        seconds < 0 || seconds > 59
    ) {
        throw new RangeError(`Invalid GTFS time: ${time}`);
    }

    return hours * 3600 + minutes * 60 + seconds;
}


function secondsToGtfsTime(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
        throw new TypeError("GTFS seconds must be non-negative.");
    }

    const roundedSeconds = Math.floor(totalSeconds);
    const hours = Math.floor(roundedSeconds / 3600);
    const minutes = Math.floor((roundedSeconds % 3600) / 60);
    const seconds = roundedSeconds % 60;

    return [hours, minutes, seconds]
        .map(value => String(value).padStart(2, "0"))
        .join(":");
}


module.exports = {
    gtfsTimeToSeconds,
    secondsToGtfsTime
};
