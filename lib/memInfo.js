import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {parseMemInfoText} from './memInfoParser.js';
export {parseMemInfoText} from './memInfoParser.js';

let cachedSnapshot = null;
let cachedAt = 0;
const CACHE_WINDOW_US = 1_000_000;

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
