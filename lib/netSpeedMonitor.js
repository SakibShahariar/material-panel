import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/** Prefer default-route iface; else first non-lo with traffic. */
export function findActiveInterface() {
    try {
        const [okR, routeBytes] = Gio.File.new_for_path('/proc/net/route').load_contents(null);
        if (okR) {
            const lines = new TextDecoder('utf-8').decode(routeBytes).split('\n');
            for (const line of lines) {
                const p = line.trim().split(/\s+/);
                if (p.length < 2 || p[0] === 'Iface')
                    continue;
                // Destination 00000000 = default route
                if (p[1] === '00000000' && p[0] !== 'lo')
                    return p[0];
            }
        }
    } catch (e) {}

    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/net/dev').load_contents(null);
        if (!ok)
            return null;
        const text = new TextDecoder('utf-8').decode(contents);
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

function readIfaceStats(iface) {
    if (!iface)
        return null;
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/net/dev').load_contents(null);
        if (!ok)
            return null;
        const text = new TextDecoder('utf-8').decode(contents);
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
 * Poll network rates once per second.
 * onUpdate({down, up, downText, upText, iface})
 * Returns cancel function.
 */
export function startNetSpeedMonitor(onUpdate, intervalSec = 1) {
    let iface = findActiveInterface();
    let prevRx = 0;
    let prevTx = 0;
    let primed = false;

    const tick = () => {
        if (!iface) {
            iface = findActiveInterface();
            primed = false;
            try {
                onUpdate({
                    down: 0, up: 0,
                    downText: '—', upText: '—',
                    downShort: '—', upShort: '—',
                    iface: null,
                });
            } catch (e) {}
            return GLib.SOURCE_CONTINUE;
        }
        const stats = readIfaceStats(iface);
        if (!stats) {
            iface = findActiveInterface();
            primed = false;
            return GLib.SOURCE_CONTINUE;
        }
        if (!primed) {
            prevRx = stats.rx;
            prevTx = stats.tx;
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
        const down = Math.max(0, stats.rx - prevRx);
        const up = Math.max(0, stats.tx - prevTx);
        prevRx = stats.rx;
        prevTx = stats.tx;
        // Rescan iface occasionally if idle forever on wrong device
        if (down === 0 && up === 0 && Math.random() < 0.05)
            iface = findActiveInterface() || iface;
        try {
            onUpdate({
                down, up,
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
