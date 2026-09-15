/**
 * Vendored AppIndicator / KStatusNotifier stack for material-panel.
 * Icons go to globalThis._materialPanelSniHost (our strip).
 */
import GLib from 'gi://GLib';

import * as Interfaces from './interfaces.js';
import * as SettingsManager from './settingsManager.js';
import * as StatusNotifierWatcher from './statusNotifierWatcher.js';
import {Logger} from './logger.js';

export class MaterialSniController {
    constructor(extension, hostProvider) {
        this._extension = extension;
        this._hostProvider = hostProvider;
        this._watcher = null;
        this._enabled = false;
        this._hostPollId = 0;
        this._seekPulseId = 0;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;

        const sniDir = GLib.build_filenamev([this._extension.path, 'lib', 'sni']);
        try {
            Logger.init(this._extension);
        } catch (e) {
            logError(e, 'material-panel: SNI Logger.init');
        }
        Interfaces.initialize(sniDir);
        SettingsManager.SettingsManager.initialize(this._extension);

        this._syncHost();
        this._hostPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._syncHost();
            return this._enabled ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        });

        const watchDog = {nameAcquired: false, nameOnBus: false};
        try {
            this._watcher = new StatusNotifierWatcher.StatusNotifierWatcher(
                this._extension, watchDog);
            log('material-panel: full AppIndicator stack enabled');
        } catch (e) {
            logError(e, 'material-panel: full SNI enable failed');
        }

        // Keep hunting for already-running tray apps for ~30s after enable
        let pulses = 0;
        this._seekPulseId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            if (!this._enabled)
                return GLib.SOURCE_REMOVE;
            pulses++;
            try {
                this._syncHost();
                this.forceSeek();
                this._pulseHostRegistered();
            } catch (e) {
                logError(e, 'material-panel: SNI seek pulse');
            }
            return pulses < 10 ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        });
    }

    _syncHost() {
        try {
            globalThis._materialPanelSniHost = this._hostProvider?.() ?? null;
        } catch (e) {
            globalThis._materialPanelSniHost = null;
        }
    }

    _pulseHostRegistered() {
        try {
            this._watcher?._dbusImpl?.emit_signal?.(
                'StatusNotifierHostRegistered', null);
            log('material-panel: SNI HostRegistered pulse');
        } catch (e) {}
    }

    forceSeek() {
        if (!this._watcher || !this._extension)
            return;
        try {
            this._watcher._seekStatusNotifierItems(this._extension).catch(e => {
                logError(e, 'material-panel: forceSeek');
            });
        } catch (e) {
            logError(e, 'material-panel: forceSeek throw');
        }
        // Also direct path probe (in-process, no subprocess)
        try {
            this._watcher._quickProbePaths?.();
        } catch (e) {}
    }

    disable() {
        this._enabled = false;
        if (this._hostPollId) {
            try { GLib.source_remove(this._hostPollId); } catch (e) {}
            this._hostPollId = 0;
        }
        if (this._seekPulseId) {
            try { GLib.source_remove(this._seekPulseId); } catch (e) {}
            this._seekPulseId = 0;
        }
        try {
            this._watcher?.destroy?.();
        } catch (e) {
            logError(e, 'material-panel: SNI destroy');
        }
        this._watcher = null;
        try { SettingsManager.SettingsManager.destroy(); } catch (e) {}
        try { Interfaces.destroy(); } catch (e) {}
        globalThis._materialPanelSniHost = null;
    }
}
