import {calculateDeltas, calculateRates, hasInterfaceChanged} from './netSpeedMath.js';
import {readProcNetDevText} from './procNetDev.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/** Prefer default-route iface; else first non-lo with traffic. */
export function findActiveInterface(netDevText = null) {
    try {
        const [okR, routeBytes] = Gio.File.new_for_path('/proc/net/route').load_contents(null);
        if (okR) {
            const lines = new TextDecoder('utf-8').decode(routeBytes).split('\n');
            let bestIface = null;
            let bestMetric = Infinity;
            for (const line of lines) {
                const p = line.trim().split(/\s+/);
                if (p.length < 7 || p[0] === 'Iface' || p[0] === 'lo')
                    continue;
                // Destination 00000000 = default route. Ignore routes that are
                // not up, and prefer the lowest kernel route metric.
                if (p[1] !== '00000000')
                    continue;
                const flags = Number.parseInt(p[3], 16) || 0;
                const metric = Number.parseInt(p[6], 10);
                if (!(flags & 0x1) || !Number.isFinite(metric))
                    continue;
                if (metric < bestMetric) {
                    bestMetric = metric;
                    bestIface = p[0];
                }
            }
            if (bestIface)
                return bestIface;
        }
    } catch (e) {}

    // IPv6-only networks have their default route in this separate table.
    try {
        const [ok6, route6Bytes] = Gio.File.new_for_path('/proc/net/ipv6_route').load_contents(null);
        if (ok6) {
            let bestIface = null;
            let bestMetric = Infinity;
            for (const line of new TextDecoder('utf-8').decode(route6Bytes).split('\n')) {
                const p = line.trim().split(/\s+/);
                if (p.length < 10 || !/^0{32}$/i.test(p[0]) || p[1] !== '00')
                    continue;
                const metric = Number.parseInt(p[5], 16);
                const flags = Number.parseInt(p[8], 16) || 0;
                if (!(flags & 0x1) || !Number.isFinite(metric) || !p[9])
                    continue;
                if (metric < bestMetric) {
                    bestMetric = metric;
                    bestIface = p[9];
                }
            }
            if (bestIface)
                return bestIface;
        }
    } catch (e) {}

    try {
        const text = netDevText ?? readProcNetDevText();
        if (text === null)
            return null;
        let best = null;
        let bestTraffic = -1;
        for (const line of text.split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10)
                continue;
            const iface = parts[0].replace(':', '');
            if (!iface || iface === 'lo')
                continue;
            const rx = parseInt(parts[1], 10) || 0;
            const tx = parseInt(parts[9], 10) || 0;
            const traffic = rx + tx;
            if (traffic > bestTraffic) {
                bestTraffic = traffic;
                best = iface;
            }
        }
        return best;
    } catch (e) {}
    return null;
}

export function formatSpeed(bytesPerSec) {
    const n = Math.max(0, Number(bytesPerSec) || 0);
    if (n < 1024)
        return `${Math.round(n)} B/s`;
    if (n < 1024 * 1024)
        return `${(n / 1024).toFixed(1)} KB/s`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB/s`;
}

/** Compact for tight tiles: 12K / 1.2M */
export function formatSpeedShort(bytesPerSec) {
    const n = Math.max(0, Number(bytesPerSec) || 0);
    if (n < 1024)
        return `${Math.round(n)}B`;
    if (n < 1024 * 1024)
        return `${Math.round(n / 1024)}K`;
    return `${(n / (1024 * 1024)).toFixed(1)}M`;
}

function readIfaceStatsFromText(text, iface) {
    if (!iface || text === null || text === undefined)
        return null;
    try {
        for (const line of text.split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10)
                continue;
            if (parts[0].replace(':', '') !== iface)
                continue;
            return {
                rx: parseInt(parts[1], 10) || 0,
                tx: parseInt(parts[9], 10) || 0,
            };
        }
    } catch (e) {}
    return null;
}

/**
 * Poll network rates at the requested interval, measuring actual elapsed time.
 * onUpdate({down, up, downText, upText, iface})
 * Returns cancel function.
 */
export function startNetSpeedMonitor(onUpdate, intervalSec = 1, shouldPause = null) {
    let iface = null;
    let prevRx = 0;
    let prevTx = 0;
    let prevTime = 0;
    let primed = false;
    let lastRouteCheckAt = 0;
    const ROUTE_RECHECK_INTERVAL_US = 5 * 1_000_000;

    const tick = () => {
        try {
            if (shouldPause?.()) {
                // Re-prime counters after a pause so elapsed idle time is not
                // mistaken for a one-second traffic-rate sample.
                primed = false;
                return GLib.SOURCE_CONTINUE;
            }
        } catch (e) {}
        // Read /proc/net/dev once and share that snapshot with both interface
        // discovery and counter sampling. Route tables are rechecked periodically,
        // not parsed from scratch on every one-second sample.
        const sampledText = readProcNetDevText();
        if (sampledText === null) {
            primed = false;
            try {
                onUpdate({
                    down: 0, up: 0, rxDelta: 0, txDelta: 0,
                    downText: '—', upText: '—',
                    downShort: '—', upShort: '—',
                    iface: null,
                });
            } catch (e) {}
            return GLib.SOURCE_CONTINUE;
        }
        const now = GLib.get_monotonic_time();
        let stats = readIfaceStatsFromText(sampledText, iface);
        if (!iface || !stats || now - lastRouteCheckAt >= ROUTE_RECHECK_INTERVAL_US) {
            const activeIface = findActiveInterface(sampledText);
            lastRouteCheckAt = now;
            if (hasInterfaceChanged(iface, activeIface))
                primed = false;
            iface = activeIface;
            stats = readIfaceStatsFromText(sampledText, iface);
        }

        if (!iface || !stats) {
            primed = false;
            try {
                onUpdate({
                    down: 0, up: 0, rxDelta: 0, txDelta: 0,
                    downText: '—', upText: '—',
                    downShort: '—', upShort: '—',
                    iface: null,
                });
            } catch (e) {}
            return GLib.SOURCE_CONTINUE;
        }
        const sampledAt = GLib.get_monotonic_time();
        if (!primed) {
            prevRx = stats.rx;
            prevTx = stats.tx;
            prevTime = sampledAt;
            primed = true;
            try {
                onUpdate({
                    down: 0, up: 0,
                    downText: '—', upText: '—',
                    downShort: '—', upShort: '—',
                    iface,
                });
            } catch (e) {}
            return GLib.SOURCE_CONTINUE;
        }
        const previous = {rx: prevRx, tx: prevTx};
        const {down, up} = calculateRates(
            previous,
            stats,
            (sampledAt - prevTime) / 1_000_000,
        );
        const {rxDelta, txDelta} = calculateDeltas(previous, stats);
        prevRx = stats.rx;
        prevTx = stats.tx;
        prevTime = sampledAt;
        try {
            onUpdate({
                down, up, rxDelta, txDelta,
                downText: formatSpeed(down),
                upText: formatSpeed(up),
                downShort: formatSpeedShort(down),
                upShort: formatSpeedShort(up),
                iface,
            });
        } catch (e) {}
        return GLib.SOURCE_CONTINUE;
    };

    tick();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, intervalSec, tick);
    return () => {
        try { GLib.source_remove(id); } catch (e) {}
    };
}
