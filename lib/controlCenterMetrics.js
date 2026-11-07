/** Pure formatting and delta helpers for the Control Center System view. */
export function calculateCpuPercent(previous, current) {
    if (!previous || !current ||
        !Number.isFinite(previous.idle) || !Number.isFinite(previous.total) ||
        !Number.isFinite(current.idle) || !Number.isFinite(current.total))
        return null;
    const totalDelta = current.total - previous.total;
    const idleDelta = current.idle - previous.idle;
    if (totalDelta <= 0 || idleDelta < 0 || idleDelta > totalDelta)
        return null;
    return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

export function parseTemperatureValue(raw) {
    const number = Number.parseInt(String(raw ?? '').trim(), 10);
    if (!Number.isFinite(number))
        return null;
    const value = number > 1000 ? number / 1000 : number;
    return value >= -30 && value <= 150 ? Math.round(value) : null;
}

export function formatNetworkRate(bytesPerSecond) {
    const value = Math.max(0, Number(bytesPerSecond) || 0);
    if (value < 1024)
        return Math.round(value) + ' B/s';
    if (value < 1024 * 1024)
        return (value / 1024).toFixed(1) + ' KB/s';
    return (value / (1024 * 1024)).toFixed(1) + ' MB/s';
}
