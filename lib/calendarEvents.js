/**
 * Omarchy-compatible calendar events file.
 * Cache: $XDG_CACHE_HOME/material-panel/calendar-events.json
 * Schema matches omarchy-calendar / gws sync export.
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export function eventsFilePath() {
    return GLib.build_filenamev([
        GLib.get_user_cache_dir(), 'material-panel', 'calendar-events.json',
    ]);
}

function legacyEventsFilePath() {
    return GLib.build_filenamev([
        GLib.get_home_dir(), '.config', 'material-panel', 'calendar-events.json',
    ]);
}

function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
}

export function dateKeyFromYmd(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function dateKeyToday() {
    const n = GLib.DateTime.new_now_local();
    return dateKeyFromYmd(n.get_year(), n.get_month(), n.get_day_of_month());
}

let cachedCalendarDocument;
let calendarCacheGeneration = 0;
let calendarLoadInFlight = false;
let calendarLoadCallbacks = [];
let calendarMonitorsInitialized = false;
const calendarChangeListeners = new Set();
const calendarMonitors = [];

function parseCalendarDocument(contents) {
    try {
        const text = new TextDecoder('utf-8').decode(contents);
        const doc = JSON.parse(text);
        if (!doc || !Array.isArray(doc.events))
            return {events: [], source: doc?.source || '', syncedAt: doc?.syncedAt || ''};
        return {
            events: doc.events,
            source: doc.source || '',
            syncedAt: doc.syncedAt || '',
        };
    } catch (e) {
        logError(e, 'material-panel: parse calendar-events.json');
        return null;
    }
}

/**
 * Accept only well-formed HTTPS event links. These URLs are passed directly
 * to Gio, never to a shell; reject shell metacharacters as an extra guard
 * against malformed or hostile calendar data.
 */
export function safeEventUrl(value) {
    if (typeof value !== 'string' || !value.trim())
        return null;
    const candidate = value.trim();
    if (/['"\x60;$(){}|<>\\\n\r]/.test(candidate))
        return null;
    try {
        const url = new URL(candidate);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
            return null;
        return url.href;
    } catch (e) {
        return null;
    }
}

/** @returns {{events: object[], source: string, syncedAt: string}|null} */
export function loadCalendarDocument() {
    try {
        let file = Gio.File.new_for_path(eventsFilePath());
        if (!file.query_exists(null)) {
            // Read existing installations' config-directory cache until the
            // next sync writes the new cache path. Never write back to config.
            file = Gio.File.new_for_path(legacyEventsFilePath());
            if (!file.query_exists(null))
                return null;
        }
        const [, contents] = file.load_contents(null);
        return parseCalendarDocument(contents);
    } catch (e) {
        logError(e, 'material-panel: loadCalendarDocument');
        return null;
    }
}

function invalidateCalendarCache() {
    calendarCacheGeneration++;
    cachedCalendarDocument = undefined;
    for (const listener of [...calendarChangeListeners]) {
        try { listener(); } catch (e) {}
    }
}

function ensureCalendarMonitors() {
    if (calendarMonitorsInitialized)
        return;
    calendarMonitorsInitialized = true;
    for (const path of [eventsFilePath(), legacyEventsFilePath()]) {
        try {
            const file = Gio.File.new_for_path(path);
            const dir = file.get_parent();
            if (!dir)
                continue;
            const monitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
            monitor.connect('changed', (_monitor, changedFile) => {
                try {
                    if (changedFile?.get_basename() === file.get_basename())
                        invalidateCalendarCache();
                } catch (e) {}
            });
            calendarMonitors.push(monitor);
        } catch (e) {
            // A missing cache directory is normal before the first calendar sync.
        }
    }
}

/** Subscribe to calendar cache changes; return a disposer for module teardown. */
export function watchCalendarDocument(callback) {
    ensureCalendarMonitors();
    calendarChangeListeners.add(callback);
    return () => calendarChangeListeners.delete(callback);
}

/**
 * Load the cache asynchronously and memoize the parsed document until a file
 * monitor event invalidates it. Concurrent callers share one in-flight read.
 */
export function loadCalendarDocumentAsync(callback) {
    ensureCalendarMonitors();
    if (cachedCalendarDocument !== undefined) {
        callback(cachedCalendarDocument);
        return;
    }
    if (callback)
        calendarLoadCallbacks.push(callback);
    if (calendarLoadInFlight)
        return;
    calendarLoadInFlight = true;
    let loadGeneration = calendarCacheGeneration;
    const complete = document => {
        if (loadGeneration !== calendarCacheGeneration) {
            loadGeneration = calendarCacheGeneration;
            readPrimary();
            return;
        }
        cachedCalendarDocument = document;
        calendarLoadInFlight = false;
        const callbacks = calendarLoadCallbacks;
        calendarLoadCallbacks = [];
        for (const done of callbacks) {
            try { done(document); } catch (e) {
                logError(e, 'material-panel: calendar async load callback');
            }
        }
    };
    const readPath = (path, done) => {
        const file = Gio.File.new_for_path(path);
        try {
            file.load_contents_async(null, (source, result) => {
                try {
                    const [ok, contents] = source.load_contents_finish(result);
                    if (!ok) {
                        done(null, false);
                        return;
                    }
                    done(parseCalendarDocument(contents), true);
                } catch (e) {
                    done(null, false);
                }
            });
        } catch (e) {
            done(null, false);
        }
    };
    const readLegacy = () => {
        readPath(legacyEventsFilePath(), (document, readable) => complete(readable ? document : null));
    };
    const readPrimary = () => {
        readPath(eventsFilePath(), (document, readable) => {
            if (readable)
                complete(document);
            else
                readLegacy();
        });
    };
    readPrimary();
}

export function indexEventsByDate(events) {
    const map = new Map();
    for (const ev of events || []) {
        try {
            if (ev?.allDay === true && isNoisy(ev))
                continue;
            let key = ev.dateKey;
            if (!key && ev.start) {
                const m = String(ev.start).match(/^(\d{4}-\d{2}-\d{2})/);
                key = m ? m[1] : null;
            }
            if (!key)
                continue;
            if (!map.has(key))
                map.set(key, []);
            map.get(key).push(ev);
        } catch (e) {}
    }
    for (const [, list] of map) {
        list.sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    }
    return map;
}

function isNoisy(ev) {
    const t = String(ev?.eventType || ev?.type || '').toLowerCase();
    return t.includes('workingLocation') || t.includes('working_location');
}

export function eventsForDateKey(index, key) {
    if (!index || !key)
        return [];
    return index.get(key) || [];
}

export function parseEventTime(iso) {
    if (!iso)
        return null;
    try {
        // GLib can parse many ISO forms
        let dt = GLib.DateTime.new_from_iso8601(String(iso), null);
        if (!dt) {
            // Fallback: strip tz and parse local
            const m = String(iso).match(
                /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
            if (m) {
                dt = GLib.DateTime.new_local(
                    Number(m[1]), Number(m[2]), Number(m[3]),
                    Number(m[4]), Number(m[5]), 0);
            }
        }
        return dt;
    } catch (e) {
        return null;
    }
}

/** Next timed event that has not started yet. */
export function nextEvent(events, now = null) {
    const n = now || GLib.DateTime.new_now_local();
    const nowUnix = n.to_unix();
    let best = null;
    let bestStart = Infinity;
    for (const ev of events || []) {
        try {
            if (ev.allDay)
                continue;
            if (isNoisy(ev))
                continue;
            const st = parseEventTime(ev.start);
            if (!st)
                continue;
            const u = st.to_unix();
            if (u < nowUnix)
                continue;
            if (u < bestStart) {
                bestStart = u;
                best = ev;
            }
        } catch (e) {}
    }
    return best;
}

export function formatCountdown(ev, now = null) {
    const n = now || GLib.DateTime.new_now_local();
    const st = parseEventTime(ev?.start);
    if (!st)
        return '';
    const sec = st.to_unix() - n.to_unix();
    if (sec <= 60)
        return 'now';
    if (sec < 3600)
        return `in ${Math.ceil(sec / 60)}m`;
    if (sec < 86400)
        return `in ${Math.floor(sec / 3600)}h`;
    return `in ${Math.floor(sec / 86400)}d`;
}

export function formatEventTimeRange(ev) {
    if (ev?.allDay)
        return 'All day';
    const st = parseEventTime(ev?.start);
    const en = parseEventTime(ev?.end);
    if (!st)
        return '';
    const a = st.format('%H:%M') || '';
    const b = en ? (en.format('%H:%M') || '') : '';
    return b ? `${a} – ${b}` : a;
}

export function meetingUrl(ev) {
    const u = ev?.meetingUrl || ev?.hangoutLink || ev?.htmlLink || ev?.url || '';
    if (!u || typeof u !== 'string')
        return null;
    if (/^https?:\/\//i.test(u))
        return u;
    return null;
}
