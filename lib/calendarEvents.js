/**
 * Omarchy-compatible calendar events file.
 * Path: ~/.config/material-panel/calendar-events.json
 * Schema matches omarchy-calendar / gws sync export.
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export function eventsFilePath() {
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

/** @returns {{events: object[], source: string, syncedAt: string}|null} */
export function loadCalendarDocument() {
    try {
        const path = eventsFilePath();
        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null))
            return null;
        const [, contents] = file.load_contents(null);
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
        logError(e, 'material-panel: loadCalendarDocument');
        return null;
    }
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
