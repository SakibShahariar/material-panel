/**
 * Last-known Control Center metrics shared by Home and the detailed System view.
 * Producers reuse their existing samplers; Home never starts a second poller.
 */
let systemMetrics = null;
let diskSummary = null;
const listeners = new Set();
export function getControlCenterSummary() {
    return {system: systemMetrics ? {...systemMetrics} : null, disk: diskSummary ? {...diskSummary} : null};
}
function publish() {
    const snapshot = getControlCenterSummary();
    for (const listener of [...listeners]) { try { listener(snapshot); } catch (e) {} }
}
export function watchControlCenterSummary(callback) {
    if (typeof callback !== 'function') return () => {};
    listeners.add(callback);
    try { callback(getControlCenterSummary()); } catch (e) {}
    return () => listeners.delete(callback);
}
export function setControlCenterMetrics(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) systemMetrics = null;
    else {
        const numberOrNull = n => Number.isFinite(n) ? n : null;
        systemMetrics = {cpu: numberOrNull(value.cpu), memory: numberOrNull(value.memory),
            temperature: numberOrNull(value.temperature), sampledAt: Number.isFinite(value.sampledAt) ? value.sampledAt : 0};
    }
    publish();
}
export function setControlCenterDiskSummary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) diskSummary = null;
    else {
        const numberOrNull = n => Number.isFinite(n) ? n : null;
        diskSummary = {pct: numberOrNull(value.pct), used: numberOrNull(value.used),
            size: numberOrNull(value.size), sampledAt: Number.isFinite(value.sampledAt) ? value.sampledAt : 0};
    }
    publish();
}
export function clearControlCenterSummary() { systemMetrics = null; diskSummary = null; publish(); }
