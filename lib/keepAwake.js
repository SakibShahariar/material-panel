import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'org.gnome.SessionManager';
const OBJECT_PATH = '/org/gnome/SessionManager';
const INTERFACE = 'org.gnome.SessionManager';
const APP_ID = 'material-panel@SakibShahariar';
const INHIBIT_SUSPEND = 4;

let inhibitCookie = null;
let timerId = 0;
let generation = 0;
let activeDuration = 0;
let expiresAt = 0;
const listeners = new Set();

function emitState() {
    const state = getKeepAwakeState();
    for (const listener of listeners) {
        try { listener(state); } catch (e) {}
    }
}

function clearTimer() {
    if (timerId) {
        try { GLib.source_remove(timerId); } catch (e) {}
        timerId = 0;
    }
}

function uninhibit(cookie) {
    if (cookie == null)
        return;
    Gio.DBus.session.call(
        BUS_NAME,
        OBJECT_PATH,
        INTERFACE,
        'Uninhibit',
        new GLib.Variant('(u)', [cookie]),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (_connection, result) => {
            try { Gio.DBus.session.call_finish(result); } catch (e) {
                logError(e, 'material-panel: failed to release keep-awake inhibitor');
            }
        });
}

export function getKeepAwakeState() {
    return {
        active: inhibitCookie !== null,
        duration: activeDuration,
        expiresAt,
    };
}

export function subscribeKeepAwake(callback) {
    listeners.add(callback);
    try { callback(getKeepAwakeState()); } catch (e) {}
    return () => listeners.delete(callback);
}

export function startKeepAwake(durationSeconds = 0) {
    const duration = Math.max(0, Math.floor(Number(durationSeconds) || 0));
    const requestGeneration = ++generation;
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(
            BUS_NAME,
            OBJECT_PATH,
            INTERFACE,
            'Inhibit',
            new GLib.Variant('(susu)', [
                APP_ID,
                0,
                'Keep the computer awake from Material Panel',
                INHIBIT_SUSPEND,
            ]),
            new GLib.VariantType('(u)'),
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (_connection, result) => {
                let cookie;
                try {
                    const reply = Gio.DBus.session.call_finish(result);
                    cookie = reply.deep_unpack()[0];
                } catch (e) {
                    if (requestGeneration === generation)
                        reject(e);
                    else
                        resolve(false);
                    return;
                }

                if (requestGeneration !== generation) {
                    uninhibit(cookie);
                    resolve(false);
                    return;
                }

                const previousCookie = inhibitCookie;
                clearTimer();
                inhibitCookie = cookie;
                activeDuration = duration;
                expiresAt = duration > 0
                    ? GLib.get_monotonic_time() + duration * 1_000_000
                    : 0;
                if (previousCookie !== null && previousCookie !== cookie)
                    uninhibit(previousCookie);
                if (duration > 0) {
                    timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, duration, () => {
                        timerId = 0;
                        stopKeepAwake();
                        return GLib.SOURCE_REMOVE;
                    });
                }
                emitState();
                resolve(true);
            });
    });
}

export function stopKeepAwake() {
    generation++;
    clearTimer();
    const cookie = inhibitCookie;
    inhibitCookie = null;
    activeDuration = 0;
    expiresAt = 0;
    emitState();
    uninhibit(cookie);
}
