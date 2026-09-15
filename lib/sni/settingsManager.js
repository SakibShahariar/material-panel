/**
 * Stub settings for vendored AppIndicator (no separate GSettings schema).
 */
import GLib from 'gi://GLib';

const DEFAULTS = {
    'tray-pos': 'right',
    'icon-size': 16,
    'icon-opacity': 255,
    'icon-brightness': 0.0,
    'icon-contrast': 0.0,
    'icon-saturation': 0.0,
    'legacy-tray-enabled': false,
    'compact-mode-enabled': false,
    'custom-icons': [],
};

class FakeSettings {
    constructor() {
        this._values = {...DEFAULTS};
        this._handlers = new Map();
        this._nextId = 1;
    }

    get_string(key) {
        return String(this._values[key] ?? '');
    }

    get_int(key) {
        return Number(this._values[key] ?? 0) | 0;
    }

    get_double(key) {
        return Number(this._values[key] ?? 0);
    }

    get_boolean(key) {
        return !!this._values[key];
    }

    get_user_value(key) {
        return null;
    }

    get_value(key) {
        const v = this._values[key];
        if (Array.isArray(v))
            return new GLib.Variant('a(sss)', []);
        if (typeof v === 'boolean')
            return new GLib.Variant('b', v);
        if (typeof v === 'number' && Number.isInteger(v))
            return new GLib.Variant('i', v);
        if (typeof v === 'number')
            return new GLib.Variant('d', v);
        return new GLib.Variant('s', String(v ?? ''));
    }

    connect(signal, cb) {
        const id = this._nextId++;
        this._handlers.set(id, {signal, cb});
        return id;
    }

    disconnect(id) {
        this._handlers.delete(id);
    }
}

export class SettingsManager {
    static initialize(_extension) {
        SettingsManager._settingsManager = new SettingsManager();
    }

    static destroy() {
        SettingsManager._settingsManager = null;
    }

    static getDefault() {
        return SettingsManager._settingsManager;
    }

    get gsettings() {
        return this._gsettings;
    }

    constructor() {
        this._gsettings = new FakeSettings();
    }

    destroy() {
        this._gsettings = null;
    }
}

export function getDefault() {
    return SettingsManager.getDefault();
}

export function getDefaultGSettings() {
    return SettingsManager.getDefault().gsettings;
}
