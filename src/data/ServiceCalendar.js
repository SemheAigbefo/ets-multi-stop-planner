const DAY_TYPE = Object.freeze({
    WEEKDAY: "weekday",
    SATURDAY: "saturday",
    SUNDAY: "sunday"
});


function dayTypeForDate(date) {
    if (!/^\d{8}$/.test(String(date))) return null;
    const value = String(date);
    const parsed = new Date(Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)) - 1,
        Number(value.slice(6, 8))
    ));
    if (Number.isNaN(parsed.getTime())) return null;
    const day = parsed.getUTCDay();
    if (day === 6) return DAY_TYPE.SATURDAY;
    if (day === 0) return DAY_TYPE.SUNDAY;
    return DAY_TYPE.WEEKDAY;
}


function dayTypeForServiceId(serviceId) {
    const value = String(serviceId).toLowerCase();
    if (value.includes("weekday")) return DAY_TYPE.WEEKDAY;
    if (value.includes("saturday")) return DAY_TYPE.SATURDAY;
    if (value.includes("sunday")) return DAY_TYPE.SUNDAY;
    return null;
}


class ServiceCalendar extends Map {
    constructor() {
        super();
        this.fallbackByDayType = new Map();
    }

    get(date) {
        if (super.has(date)) return super.get(date);
        const fallback = this.fallbackByDayType.get(dayTypeForDate(date));
        return fallback?.services;
    }

    resolutionFor(date) {
        if (super.has(date)) {
            return { requestedDate: date, sourceDate: date,
                dayType: dayTypeForDate(date), exact: true };
        }
        const dayType = dayTypeForDate(date);
        const fallback = this.fallbackByDayType.get(dayType);
        return fallback ? { requestedDate: date, sourceDate: fallback.sourceDate,
            dayType, exact: false } : null;
    }

    buildFallbacks() {
        const candidates = new Map();
        for (const [date, services] of super.entries()) {
            const calendarDayType = dayTypeForDate(date);
            let matchingServices = 0;
            for (const serviceId of services) {
                if (dayTypeForServiceId(serviceId) === calendarDayType) {
                    matchingServices++;
                }
            }

            // Exclude holidays such as July 1, where a weekday calendar date
            // intentionally contains Sunday service.
            if (matchingServices < services.size / 2) continue;
            const previous = candidates.get(calendarDayType);
            if (!previous || date > previous.sourceDate) {
                candidates.set(calendarDayType, { sourceDate: date, services });
            }
        }
        this.fallbackByDayType = candidates;
        return this;
    }
}


module.exports = { ServiceCalendar, dayTypeForDate, dayTypeForServiceId };
