const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

/**
 * Temporarily suppress notification banners while preserving the user's
 * manual show-banners preference for restoration when the session ends.
 *
 * Timer functions are injected so the state machine can be tested without
 * a running GNOME Shell or GLib main loop.
 */
export class DndFocusSession {
    constructor(settings, {now = Date.now, schedule, cancelSchedule} = {}) {
        if (!settings?.get_boolean || !settings?.set_boolean ||
            typeof schedule !== 'function' || typeof cancelSchedule !== 'function')
            throw new TypeError('DndFocusSession requires settings and timer adapters');

        this._settings = settings;
        this._now = now;
        this._schedule = schedule;
        this._cancelSchedule = cancelSchedule;
        this._endsAt = null;
        this._restoreShowBanners = null;
        this._timerId = null;
        this._expectedShowBanners = null;
        this._listeners = new Set();
        this._settingsChangedId = settings.connect?.(
            'changed::show-banners', () => this._onSettingsChanged()) ?? null;
    }

    isActive() {
        if (this._endsAt === null)
            return false;
        if (this._endsAt <= this._now()) {
            this._finish();
            return false;
        }
        return true;
    }

    getSnapshot() {
        const active = this.isActive();
        return {
            active,
            endsAt: active ? this._endsAt : null,
            remainingMs: active ? Math.max(0, this._endsAt - this._now()) : 0,
        };
    }

    subscribe(listener) {
        if (typeof listener !== 'function')
            return () => {};
        this._listeners.add(listener);
        try { listener(this.getSnapshot()); } catch (e) {}
        return () => this._listeners.delete(listener);
    }

    start(durationMs) {
        let duration;
        try {
            duration = Number(durationMs);
        } catch (e) {
            return false;
        }
        if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SESSION_MS)
            return false;

        if (!this.isActive())
            this._restoreShowBanners = this._settings.get_boolean('show-banners');

        this._endsAt = this._now() + Math.round(duration);
        this._writeShowBanners(false);
        if (!this._scheduleExpiry()) {
            this._finish();
            return false;
        }
        this._notify();
        return true;
    }

    cancel() {
        if (!this.isActive())
            return false;
        this._finish();
        return true;
    }

    destroy() {
        if (this._endsAt !== null)
            this._finish();
        if (this._settingsChangedId !== null) {
            try { this._settings.disconnect(this._settingsChangedId); } catch (e) {}
            this._settingsChangedId = null;
        }
        this._listeners.clear();
    }

    _onSettingsChanged() {
        const current = this._settings.get_boolean('show-banners');
        if (this._expectedShowBanners === current) {
            this._expectedShowBanners = null;
            return;
        }

        if (this.isActive()) {
            // Remember external/manual changes, but keep the active session's
            // notification suppression in force until it ends or is cancelled.
            this._restoreShowBanners = current;
            if (current)
                this._writeShowBanners(false);
        } else {
            this._restoreShowBanners = current;
        }
        this._notify();
    }

    _writeShowBanners(value) {
        if (this._settings.get_boolean('show-banners') === value)
            return;
        this._expectedShowBanners = value;
        this._settings.set_boolean('show-banners', value);
    }

    _scheduleExpiry() {
        if (this._timerId !== null) {
            try { this._cancelSchedule(this._timerId); } catch (e) {}
            this._timerId = null;
        }
        const delay = Math.max(1, this._endsAt - this._now());
        try {
            this._timerId = this._schedule(() => {
                this._timerId = null;
                if (this._endsAt === null)
                    return;
                if (this._endsAt <= this._now())
                    this._finish();
                else
                    this._scheduleExpiry();
            }, delay);
            return this._timerId !== null && this._timerId !== undefined;
        } catch (e) {
            this._timerId = null;
            return false;
        }
    }

    _finish() {
        const restore = this._restoreShowBanners;
        this._endsAt = null;
        this._restoreShowBanners = null;
        if (this._timerId !== null) {
            try { this._cancelSchedule(this._timerId); } catch (e) {}
            this._timerId = null;
        }
        if (restore !== null)
            this._writeShowBanners(restore);
        this._notify();
    }

    _notify() {
        const snapshot = this.getSnapshot();
        for (const listener of this._listeners) {
            try { listener(snapshot); } catch (e) {}
        }
    }
}

let sharedSession = null;

export function getDndFocusSession(settings, timerAdapters) {
    if (!sharedSession)
        sharedSession = new DndFocusSession(settings, timerAdapters);
    return sharedSession;
}

export function clearDndFocusSession() {
    const session = sharedSession;
    sharedSession = null;
    session?.destroy();
}
