/**
 * Latest weather snapshot shared by the panel Weather chip and Control Center.
 * The Control Center only observes this state; it never starts a second fetch.
 */
let summary = null;
const listeners = new Set();

function publish() {
    for (const listener of [...listeners]) {
        try { listener(summary); } catch (e) {}
    }
}

export function getWeatherSummary() {
    return summary;
}

export function setWeatherSummary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        summary = null;
    } else {
        summary = {
            temp: value.temp != null && Number.isFinite(Number(value.temp)) ? Number(value.temp) : null,
            condition: String(value.condition || ''),
            place: String(value.place || ''),
            source: String(value.source || ''),
            savedAt: Number.isFinite(value.savedAt) ? value.savedAt : 0,
            stale: value.stale === true,
        };
    }
    publish();
}

export function watchWeatherSummary(callback) {
    if (typeof callback !== 'function')
        return () => {};
    listeners.add(callback);
    try { callback(summary); } catch (e) {}
    return () => listeners.delete(callback);
}

export function clearWeatherSummary() {
    summary = null;
    publish();
}
