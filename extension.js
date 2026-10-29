import GLib from 'gi://GLib';
import {closeMixerControl} from './lib/audio.js';
import {clearPanelMenus} from './lib/popupDismiss.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore, resolveColorSource} from './lib/configStore.js';
import {PanelBuilder} from './lib/panelBuilder.js';
import {StatusAreaBridge} from './lib/statusAreaBridge.js';
import {applyLayoutStyle} from './lib/layoutPresets.js';
import {ThemeManager} from './lib/theme.js';
import {classifyConfigChange, getChangedConfigKeys} from './lib/configChange.js';

function scaleOf(c) {
    const s = Number(c?.panelSize?.scale);
    return Number.isFinite(s) ? s : 1.0;
}


export default class MaterialPanelExtension extends Extension {
    enable() {
        this._configStore = new ConfigStore();
        this._config = this._configStore.load();
        globalThis._materialPanelWeatherLocation = this._config.weatherLocation ?? {};
        this._sizeDebounceId = 0;

        this._bridge = new StatusAreaBridge();
        this._bridge.enable();

        // Tray icons: use system AppIndicator / BetterTrayIcons.
        // We only host appindicator-* roles on our bar (statusAreaBridge + SNI strip).

        this._builder = new PanelBuilder(this._bridge, this.path);
        this._theme = new ThemeManager(this.path);

        this._applyTheme({rebuildPanel: true});

        this._panelWasVisible = Main.panel.visible;
        Main.panel.hide();

        this._configStore.watch(incomingConfig => {
            const prev = this._config && typeof this._config === 'object' ? this._config : {};
            const newConfig = incomingConfig && typeof incomingConfig === 'object'
                ? incomingConfig
                : {};
            this._config = newConfig;
            globalThis._materialPanelWeatherLocation = newConfig.weatherLocation ?? {};

            // Classification must never strand the watcher. Unknown or malformed
            // shapes fall back to a full rebuild and a tray placement refresh.
            let changedKeys = null;
            let kind = 'unknown';
            let classificationFailed = false;
            try {
                changedKeys = getChangedConfigKeys(prev, newConfig);
                kind = classifyConfigChange(prev, newConfig, changedKeys);
            } catch (e) {
                classificationFailed = true;
                changedKeys = null;
                kind = 'unknown';
                logError(e, 'material-panel: config change classification failed; using full rebuild');
            }
            const trayChanged = classificationFailed || !changedKeys || changedKeys.some(key =>
                ['trayAllHidden', 'foreignRoleZones', 'hiddenForeignRoles'].includes(key));
            if (trayChanged) {
                const placements = newConfig.foreignRoleZones ?? {};
                log(`material-panel: tray placements updated (${Object.keys(placements).length} configured)`);
                if (GLib.getenv('MATERIAL_PANEL_DEBUG_TRAY') === '1')
                    log(`material-panel: tray placement details ${JSON.stringify(placements)}`);
                this._applyTrayOnly();
            }

            try {
                globalThis._materialPanelSliderStyle = newConfig.sliderStyle ?? 'classic';
                globalThis._materialPanelTileStyle = newConfig.qsTileStyle ?? 'classic';
            } catch (e) {}

            log(`material-panel: config change classified as "${kind}"`);

            switch (kind) {
            case 'tray':
                return;
            case 'panelSize': {
                const scaleCh = Math.abs(scaleOf(prev) - scaleOf(newConfig)) > 0.001;
                // Only scale needs destroy/recreate of panel modules (icon sizes baked in).
                // Gaps + opacity are CSS / geometry — do NOT tear down our chips/QS.
                try {
                    const panelSize = this._config.panelSize ?? {};
                    // A scale change schedules _schedulePanelSizeUpdate(), which
                    // applies the theme and chip gap itself. Avoid doing that work
                    // twice while still syncing geometry immediately.
                    if (!scaleCh) {
                        const colorSource = resolveColorSource(this._config.colorSource);
                        this._theme.apply(colorSource, panelSize, this._config.layoutStyle ?? 'default', applied => {
                            if (!applied)
                                return;
                            this._builder?._applyChipGap?.(this._config);
                            this._builder?._syncGeometry?.();
                            log(`material-panel: panelSize applied scale=${panelSize.scale} chipGap=${panelSize.chipGap} popupOpacity=${panelSize.popupOpacity} rebuild=false`);
                        });
                    } else {
                        this._builder?._syncGeometry?.();
                    }
                } catch (e) {
                    logError(e, 'material-panel: panelSize apply');
                }
                if (scaleCh)
                    this._schedulePanelSizeUpdate(true);
                return;
            }
            case 'clock':
                // modules/clock.js has its own ConfigStore.watch — no rebuild
                return;
            case 'color':
                this._applyTheme({rebuildPanel: true}); // debounced inside _schedulePanelRebuild
                return;
            default:
                try {
                    this._applyTheme({rebuildPanel: true});
                } catch (e) {
                    logError(e, 'material-panel: fallback config rebuild');
                    try { this._schedulePanelRebuild('config-classification-fallback'); } catch (e2) {}
                }
            }
        });
    }

    _applyTrayOnly() {
        try {
            // Only foreignRoleZones + trayAllHidden — never bulk hiddenForeignRoles
            this._bridge.setForeignPlacements(
                this._config.foreignRoleZones ?? {},
                [],
                {allHidden: !!this._config.trayAllHidden});
        } catch (e) {
            logError(e, 'material-panel: tray-only update failed');
        }
    }

    _schedulePanelSizeUpdate(scaleChanged) {
        if (this._sizeDebounceId) {
            GLib.source_remove(this._sizeDebounceId);
            this._sizeDebounceId = 0;
        }
        if (this._rebuildDebounceId) {
            try { GLib.source_remove(this._rebuildDebounceId); } catch (e) {}
            this._rebuildDebounceId = 0;
        }
        if (this._trayRescanIds) {
            for (const id of this._trayRescanIds) {
                try { GLib.source_remove(id); } catch (e) {}
            }
            this._trayRescanIds = [];
        }
        try {
            const panelSize = this._config.panelSize ?? {};
            const colorSource = resolveColorSource(this._config.colorSource);
            this._theme.apply(colorSource, panelSize, this._config.layoutStyle ?? 'default', applied => {
                if (!applied)
                    return;
                // Chip gap must update live without requiring scale change.
                try { this._builder?._applyChipGap?.(this._config); } catch (e) {}
                if (!scaleChanged)
                    return;
                this._sizeDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                    this._sizeDebounceId = 0;
                    this._schedulePanelRebuild('panelSize');
                    return GLib.SOURCE_REMOVE;
                });
            });
        } catch (e) {
            logError(e, 'material-panel: theme apply on size change');
        }
    }

    _applyTheme({rebuildPanel = true} = {}) {
        const panelSize = this._config.panelSize ?? {};
        const colorSource = resolveColorSource(this._config.colorSource);
        try {
            globalThis._materialPanelLayoutStyle = this._config.layoutStyle ?? 'default';
            globalThis._materialPanelSliderStyle = this._config.sliderStyle ?? 'classic';
            globalThis._materialPanelTileStyle = this._config.qsTileStyle ?? 'classic';
            globalThis._materialPanelHideProfileIdentity = this._config.hideProfileIdentity === true;
        } catch (e) {}
        try {
            // Only adjust in-memory layout placement — never save here (save → watch → rebuild loop)
            if (this._config.layoutStyle === 'end4')
                applyLayoutStyle(this._config, 'end4');
        } catch (e) {}
        this._theme.apply(colorSource, panelSize, this._config.layoutStyle ?? 'default', applied => {
            if (!applied)
                return;
            if (rebuildPanel)
                this._schedulePanelRebuild('theme');
            else
                this._applyTrayOnly();
        });

        if (colorSource) {
            this._theme.watch(colorSource, () => {
                // CSS updates immediately; modules bake primary into FileIcons at
                // build time — need a debounced rebuild so icons follow the palette.
                log('material-panel: matugen watch — theme + debounced rebuild for icons');
                try {
                    const freshSize = this._config.panelSize ?? {};
                    const freshSource = resolveColorSource(this._config.colorSource);
                    this._theme.apply(freshSource, freshSize, this._config.layoutStyle ?? 'default', applied => {
                        if (applied)
                            this._schedulePanelRebuild('matugen');
                    });
                } catch (e) {
                    logError(e, 'material-panel: matugen theme apply');
                }
            });
        } else {
            // Do not keep watching a palette file after switching to fixed colors.
            this._theme.unwatch();
        }
    }

    /** Coalesce rapid rebuilds (extension toggles / prefs storms) into one render. */
    _schedulePanelRebuild(reason = '') {
        if (this._rebuildDebounceId) {
            try { GLib.source_remove(this._rebuildDebounceId); } catch (e) {}
            this._rebuildDebounceId = 0;
        }
        log(`material-panel: panel rebuild scheduled (${reason})`);
        this._rebuildDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
            this._rebuildDebounceId = 0;
            try {
                this._builder.render(this._config);
                this._applyTrayOnly();
                this._scheduleTrayRescan();
            } catch (e) {
                logError(e, 'material-panel: debounced panel rebuild failed');
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /** AppIndicator / foreign icons often appear after our chrome is up. */
    _scheduleTrayRescan() {
        if (this._trayRescanIds) {
            for (const id of this._trayRescanIds) {
                try { GLib.source_remove(id); } catch (e) {}
            }
        }
        this._trayRescanIds = [];
        for (const ms of [400, 1200, 2500]) {
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                try {
                    this._bridge?.reattachAll?.();
                    log(`material-panel: tray rescan +${ms}ms`);
                } catch (e) {}
                return GLib.SOURCE_REMOVE;
            });
            this._trayRescanIds.push(id);
        }
    }

    disable() {

        if (this._sizeDebounceId) {
            GLib.source_remove(this._sizeDebounceId);
            this._sizeDebounceId = 0;
        }
        if (this._rebuildDebounceId) {
            try { GLib.source_remove(this._rebuildDebounceId); } catch (e) {}
            this._rebuildDebounceId = 0;
        }
        if (this._trayRescanIds) {
            for (const id of this._trayRescanIds) {
                try { GLib.source_remove(id); } catch (e) {}
            }
            this._trayRescanIds = [];
        }
        this._configStore.unwatch();
        this._configStore = null;

        this._theme.destroy();
        this._theme = null;

        // Restore tray icons to stock panel BEFORE destroying our chrome
        // (destroy used to run first and left indicators orphaned / missing).
        try {
            this._bridge.disable();
        } catch (e) {
            logError(e, 'material-panel: bridge.disable');
        }
        this._bridge = null;

        try { closeMixerControl(); } catch (e) {
            logError(e, 'material-panel: closeMixerControl');
        }
        try { clearPanelMenus(); } catch (e) {}

        try {
            this._builder.destroy();
        } catch (e) {
            logError(e, 'material-panel: builder.destroy');
        }
        this._builder = null;

        try {
            if (this._panelWasVisible !== false)
                Main.panel.show();
        } catch (e) {
            try { Main.panel.show(); } catch (e2) {}
        }

        // Clear shared theme globals so next enable does not paint stale palette
        try {
            for (const k of Object.keys(globalThis).filter(x => String(x).startsWith('_materialPanel')))
                try { globalThis[k] = undefined; } catch (e) {}
        } catch (e) {}

        this._config = null;
    }
}
