import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Share /proc/net/dev reads between CPU and network-speed modules. The short
// cache window deduplicates concurrent sampling without making counters
// noticeably stale.
let cachedText = null;
let cachedAt = 0;
const CACHE_WINDOW_US = 200_000;

export function readProcNetDevText() {
    const now = GLib.get_monotonic_time();
    if (cachedText !== null && now - cachedAt < CACHE_WINDOW_US)
        return cachedText;
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/net/dev').load_contents(null);
        if (!ok)
            return null;
        cachedText = new TextDecoder('utf-8').decode(contents);
        cachedAt = now;
        return cachedText;
    } catch (e) {
        return null;
    }
}
