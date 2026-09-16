import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore, resolveColorSource} from './lib/configStore.js';
import {PanelBuilder} from './lib/panelBuilder.js';
import {StatusAreaBridge} from './lib/statusAreaBridge.js';
import {applyLayoutStyle} from './lib/layoutPresets.js';
import {ThemeManager} from './lib/theme.js';

function cloneStrip(c, extraKeys = []) {
    const o = JSON.parse(JSON.stringify(c));
    for (const k of extraKeys)
        delete o[k];
    return o;
}

function sameExcept(prev, next, keys) {
    if (!prev || !next)
        return false;
    try {
        return JSON.stringify(cloneStrip(prev, keys)) ===
            JSON.stringify(cloneStrip(next, keys));
    } catch (e) {
        return false;
    }
}

function scaleOf(c) {
    const s = Number(c?.panelSize?.scale);
    return Number.isFinite(s) ? s : 1.0;
}

/**
 * Classify config delta so we avoid full panel rebuilds when possible.
 *
 * Prefs saves that used to rebuild everything:
 * - tray / hide-all / placement
 * - panelSize (gaps + scale)
 * - clockFormat (clock module watches config itself)
 * - colorSource (theme + optional rebuild for icons)
 * - modules / presets / hiddenModules → full rebuild (required)
 */
function classifyConfigChange(prev, next) {
    if (!prev || !next)
        return 'full';

    if (sameExcept(prev, next, [
        'trayAllHidden', 'foreignRoleZones', 'hiddenForeignRoles', 'foreignRoleZonesBackup',
    ]))
        return 'tray';

    if (sameExcept(prev, next, ['layoutStyle', 'layoutSnapshots']))
        return 'full';

    if (sameExcept(prev, next, ['panelSize']))
        return 'panelSize';

    if (sameExcept(prev, next, ['clockFormat']))
        return 'clock';

    if (sameExcept(prev, next, ['colorSource']))
        return 'color';

    return 'full';
}

export default class MaterialPanelExtension extends Extension {
    enable() {
        this._configStore = new ConfigStore();
        this._config = this._configStore.load();
        this._sizeDebounceId = 0;

        this._bridge = new StatusAreaBridge();
        this._bridge.enable();

        // Tray icons: use system AppIndicator / BetterTrayIcons.
        // We only host appindicator-* roles on our bar (statusAreaBridge + SNI strip).

        this._builder = new PanelBuilder(this._bridge, this.path);
        this._theme = new ThemeManager(this.path);

        this._applyTheme({rebuildPanel: true});



        // SNI icons often register during/after first paint — rehost a few times
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            
            return GLib.SOURCE_REMOVE;
        });
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            try {
                log('material-panel: SNI delayed rehost');
            } catch (e) {}
            return GLib.SOURCE_REMOVE;
        });

        Main.panel.hide();

        this._configStore.watch(newConfig => {
            const prev = this._config;
            this._config = newConfig;

            // Apply tray BEFORE classify so L/R/C never depends on classification
            const trayChanged = !prev ||
                prev.trayAllHidden !== newConfig.trayAllHidden ||
                JSON.stringify(prev.foreignRoleZones ?? {}) !== JSON.stringify(newConfig.foreignRoleZones ?? {}) ||
                JSON.stringify(prev.hiddenForeignRoles ?? []) !== JSON.stringify(newConfig.hiddenForeignRoles ?? []);
            if (trayChanged) {
                log(`material-panel: tray keys changed — applying placements ${JSON.stringify(newConfig.foreignRoleZones ?? {})}`);
                this._applyTrayOnly();
            }

            const kind = classifyConfigChange(prev, newConfig);
            log(`material-panel: config change classified as "${kind}"`);

            switch (kind) {
            case 'tray':
                return;
            case 'panelSize': {
                const p = prev?.panelSize ?? {};
                const n = newConfig?.panelSize ?? {};
                const scaleCh = Math.abs(scaleOf(prev) - scaleOf(newConfig)) > 0.001;
                // Only scale needs destroy/recreate of panel modules (icon sizes baked in).
                // Gaps + opacity are CSS / geometry — do NOT tear down our chips/QS.
                try {
                    const panelSize = this._config.panelSize ?? {};
                    const colorSource = resolveColorSource(this._config.colorSource);
                    this._theme.apply(colorSource, panelSize, this._config.layoutStyle ?? 'default');
                    this._builder?._applyChipGap?.(this._config);
                    this._builder?._syncGeometry?.();
                    log(`material-panel: panelSize applied scale=${panelSize.scale} chipGap=${panelSize.chipGap} popupOpacity=${panelSize.popupOpacity} rebuild=${scaleCh}`);
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
                this._applyTheme({rebuildPanel: true});
                return;
            default:
                this._applyTheme({rebuildPanel: true});
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
            this._theme.apply(colorSource, panelSize, this._config.layoutStyle ?? 'default');
        } catch (e) {
            logError(e, 'material-panel: theme apply on size change');
        }

        // Chip gap must update live without requiring scale change
        try {
            this._builder?._applyChipGap?.(this._config);
        } catch (e) {}

        if (!scaleChanged)
            return;

        this._sizeDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            this._sizeDebounceId = 0;
            this._schedulePanelRebuild('panelSize');
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyTheme({rebuildPanel = true} = {}) {
        const panelSize = this._config.panelSize ?? {};
        const colorSource = resolveColorSource(this._config.colorSource);
        try {
            globalThis._materialPanelLayoutStyle = this._config.layoutStyle ?? 'default';
        } catch (e) {}
        try {
            // Only adjust in-memory layout placement — never save here (save → watch → rebuild loop)
            if (this._config.layoutStyle === 'end4')
                applyLayoutStyle(this._config, 'end4');
        } catch (e) {}
        this._theme.apply(colorSource, panelSize, this._config.layoutStyle ?? 'default');
        if (rebuildPanel)
            this._schedulePanelRebuild('theme');
        else
            this._applyTrayOnly();

        if (colorSource) {
            this._theme.watch(colorSource, () => {
                log('material-panel: matugen watch — theme only (no panel rebuild)');
                try {
                    const freshSize = this._config.panelSize ?? {};
                    const freshSource = resolveColorSource(this._config.colorSource);
                    this._theme.apply(freshSource, freshSize, this._config.layoutStyle ?? 'default');
                } catch (e) {
                    logError(e, 'material-panel: matugen theme apply');
                }
            });
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

        try {
            this._builder.destroy();
        } catch (e) {
            logError(e, 'material-panel: builder.destroy');
        }
        this._builder = null;

        Main.panel.show();

        this._config = null;
    }
}
