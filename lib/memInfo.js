import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

let cachedSnapshot = null;
let cachedAt = 0;
const CACHE_WINDOW_US = 1_000_000;

/** Parse /proc/meminfo text into a stable, UI-friendly snapshot. */
export function parseMemInfoText(text) {
    const map = {};
    for (const line of String(text ?? '').split('\n')) {
        const match = line.match(/^(\w+):\s+(\d+)/);
        if (match)
            map[match[1]] = Number.parseInt(match[2], 10);
    }
    const total = map.MemTotal ?? 0;
    const available = map.MemAvailable ?? map.MemFree ?? 0;
    const free = map.MemFree ?? 0;
    const buffers = map.Buffers ?? 0;
    const cached = (map.Cached ?? 0) + (map.SReclaimable ?? 0);
    const used = Math.max(0, total - available);
    const swapTotal = map.SwapTotal ?? 0;
    const swapFree = map.SwapFree ?? 0;
    const swapUsed = Math.max(0, swapTotal - swapFree);
    return {
        totalKb: total, availableKb: available, usedKb: used, freeKb: free,
        cachedKb: cached, buffersKb: buffers,
        usedPct: total > 0 ? Math.round((used / total) * 100) : 0,
        swapTotalKb: swapTotal, swapUsedKb: swapUsed,
        swapPct: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0,
    };
}

/**
 * Share one short-lived /proc/meminfo read between CPU and Memory chips.
 * The UI refreshes at different intervals, so a small cache avoids duplicate
 * synchronous filesystem reads without keeping values stale for long.
 */
export function readMemInfo() {
    const now = GLib.get_monotonic_time();
    if (cachedSnapshot && now - cachedAt < CACHE_WINDOW_US)
        return cachedSnapshot;
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/meminfo').load_contents(null);
        if (!ok)
            return null;
        cachedSnapshot = parseMemInfoText(new TextDecoder('utf-8').decode(contents));
        cachedAt = now;
        return cachedSnapshot;
    } catch (e) {
        return null;
    }
}
