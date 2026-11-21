// Pure helpers shared by the network/Wi-Fi chips. No GJS imports here so the
// logic can be unit-tested with plain Node.

/** Number of filled signal bars (0..4) for a 0..100 Wi-Fi strength. */
export function signalBars(strength) {
    const n = Math.max(0, Math.min(100, Number(strength) || 0));
    if (n >= 75) return 4;
    if (n >= 50) return 3;
    if (n >= 25) return 2;
    return n > 0 ? 1 : 0;
}

/** Compact bar glyph for chip/label use, e.g. "▂▄▆█". */
export function signalGlyph(strength) {
    const glyphs = ['', '▂', '▂▄', '▂▄▆', '▂▄▆█'];
    return glyphs[signalBars(strength)];
}

/**
 * Sort access points the way the Omarchy network plugins do: the active
 * connection first, then saved/known networks, then open networks, each group
 * ordered by signal strength and name.
 */
export function sortAccessPoints(entries, {activeUuid = null, hidden = []} = {}) {
    const hiddenSet = new Set(hidden);
    const visible = entries.filter(e => !hiddenSet.has(e.ssid));
    const rank = entry => {
        if (entry.connection && entry.connection.get_uuid?.() === activeUuid) return 0;
        if (entry.connection) return 1;
        if (entry.info && !entry.info.secure) return 3;
        return 2;
    };
    return [...visible].sort((a, b) =>
        rank(a) - rank(b) ||
        (b.info?.strength ?? 0) - (a.info?.strength ?? 0) ||
        String(a.info?.ssid ?? '').localeCompare(String(b.info?.ssid ?? '')));
}

/** Normalize a byte-rate history to 0..100 for a sparkline with a rolling max. */
export function rateHistoryToPercent(values, {minScale = 1024, count = 28} = {}) {
    const list = (Array.isArray(values) ? values : []).slice(-count);
    const finite = list.filter(v => Number.isFinite(v)).map(v => Math.max(0, v));
    const scale = Math.max(minScale, ...finite);
    return list.map(v => Number.isFinite(v)
        ? Math.max(0, Math.min(100, (Math.max(0, v) / scale) * 100))
        : NaN);
}

/** Parse `ip neigh show` into IP/MAC rows, ignoring failed entries. */
export function parseArpNeighbors(text) {
    const rows = [];
    for (const line of String(text || '').split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5 || !/^\d+\.\d+\.\d+\.\d+$|^[0-9a-f:]+$/i.test(parts[0]))
            continue;
        const macIndex = parts.indexOf('lladdr');
        if (macIndex < 0 || !parts[macIndex + 1])
            continue;
        rows.push({ip: parts[0], mac: parts[macIndex + 1]});
    }
    return rows;
}

/**
 * Parse `ss -tinp` output. Each socket line carries users:(("name",pid=N,...))
 * and the following detail line carries bytes_acked / bytes_received totals.
 * Returns a map of pid -> {name, acked, received}.
 */
export function parseSsProcessBandwidth(text) {
    const out = new Map();
    const lines = String(text || '').split('\n');
    let current = null;
    for (const line of lines) {
        const users = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
        if (users) {
            current = {name: users[1], pid: Number(users[2]), acked: 0, received: 0};
            out.set(current.pid, current);
            continue;
        }
        if (!current)
            continue;
        const acked = line.match(/bytes_acked:(\d+)/);
        const received = line.match(/bytes_received:(\d+)/);
        if (acked || received) {
            current.acked = acked ? Number(acked[1]) : current.acked;
            current.received = received ? Number(received[1]) : current.received;
            current = null;
        }
    }
    return out;
}

/** Diff two ss snapshots into a sorted list of per-process byte rates. */
export function diffProcessBandwidth(prev, curr, elapsedSeconds, {max = 5} = {}) {
    const elapsed = Math.max(0.001, Number(elapsedSeconds) || 1);
    const rows = [];
    for (const [pid, next] of curr) {
        const before = prev.get(pid);
        if (!before)
            continue;
        const up = Math.max(0, next.acked - before.acked) / elapsed;
        const down = Math.max(0, next.received - before.received) / elapsed;
        rows.push({pid, name: next.name, up, down});
    }
    return rows
        .filter(r => r.up > 0 || r.down > 0)
        .sort((a, b) => (b.down + b.up) - (a.down + a.up))
        .slice(0, max);
}

/** Classify a captive-portal probe response code. */
export function classifyCaptivePortal(status) {
    const code = Number(status);
    if (code === 204)
        return 'ok';
    if (code >= 200 && code < 400)
        return 'portal';
    return 'unknown';
}
