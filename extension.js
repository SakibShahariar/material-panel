import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore, resolveColorSource} from './lib/configStore.js';
import {PanelBuilder} from './lib/panelBuilder.js';
import {StatusAreaBridge} from './lib/statusAreaBridge.js';
import {ThemeManager} from './lib/theme.js';

function cloneStrip(c, extraKeys = []) {
    const o = JSON.parse(JSON.stringify(c));
    for (const k of extraKeys)
        delete o[k];
    return o;
}

function isTrayOnlyChange(prev, next) {
    if (!prev || !next)
        return false;
    try {
        const keys = ['trayAllHidden', 'foreignRoleZones', 'hiddenForeignRoles', 'foreignRoleZonesBackup'];
        return JSON.stringify(cloneStrip(prev, keys)) === JSON.stringify(cloneStrip(next, keys));
    } catch (e) {
        return false;
    }
}

/** Only panelSize differs (scale / gaps). */
function isPanelSizeOnlyChange(prev, next) {
    if (!prev || !next)
        return false;
    try {
        return JSON.stringify(cloneStrip(prev, ['panelSize'])) ===
            JSON.stringify(cloneStrip(next, ['panelSize']));
    } catch (e) {
        return false;
    }
}

function scaleOf(c) {
    const s = Number(c?.panelSize?.scale);
    return Number.isFinite(s) ? s : 1.0;
}

export default class MaterialPanelExtension extends Extension {
    enable() {
        this._configStore = new ConfigStore();
        this._config = this._configStore.load();
        this._sizeDebounceId = 0;

        this._bridge = new StatusAreaBridge();
        this._bridge.enable();

        this._builder = new PanelBuilder(this._bridge, this.path);
        this._theme = new ThemeManager(this.path);

        this._applyTheme({rebuildPanel: true});

        Main.panel.hide();

        this._configStore.watch(newConfig => {
            const prev = this._config;
            this._config = newConfig;

            if (isTrayOnlyChange(prev, newConfig)) {
                log('material-panel: tray-only change — no rebuild');
                this._applyTrayOnly();
                return;
            }

            if (isPanelSizeOnlyChange(prev, newConfig)) {
                const scaleChanged = Math.abs(scaleOf(prev) - scaleOf(newConfig)) > 0.001;
                log(`material-panel: panelSize-only change (scaleChanged=${scaleChanged})`);
                this._schedulePanelSizeUpdate(scaleChanged);
                return;
            }

            log('material-panel: layout/theme change — full rebuild');
            this._applyTheme({rebuildPanel: true});
        });
    }

    _applyTrayOnly() {
        try {
            this._bridge.setForeignPlacements(
                this._config.foreignRoleZones ?? {},
                this._config.hiddenForeignRoles ?? [],
                {allHidden: !!this._config.trayAllHidden});
        } catch (e) {
            logError(e, 'material-panel: tray-only update failed');
        }
    }

    /**
     * Gaps → CSS only. Scale → debounced rebuild (slider fires many saves).
     */
    _schedulePanelSizeUpdate(scaleChanged) {
        if (this._sizeDebounceId) {
            GLib.source_remove(this._sizeDebounceId);
            this._sizeDebounceId = 0;
        }
        // Apply CSS immediately so gaps feel live
        try {
            const panelSize = this._config.panelSize ?? {};
            const colorSource = resolveColorSource(this._config.colorSource);
            this._theme.apply(colorSource, panelSize);
        } catch (e) {
            logError(e, 'material-panel: theme apply on size change');
        }

        if (!scaleChanged)
            return;

        this._sizeDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            this._sizeDebounceId = 0;
            try {
                this._builder.render(this._config);
                this._applyTrayOnly();
            } catch (e) {
                logError(e, 'material-panel: debounced scale rebuild failed');
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyTheme({rebuildPanel = true} = {}) {
        const panelSize = this._config.panelSize ?? {};
        const colorSource = resolveColorSource(this._config.colorSource);
        this._theme.apply(colorSource, panelSize);
        if (rebuildPanel)
            this._builder.render(this._config);
        this._applyTrayOnly();

        if (colorSource) {
            log(`material-panel: setting up matugen watch on "${colorSource}"`);
            this._theme.watch(colorSource, () => {
                log('material-panel: matugen watch callback fired, reapplying theme');
                const freshSize = this._config.panelSize ?? {};
                const freshSource = resolveColorSource(this._config.colorSource);
                this._theme.apply(freshSource, freshSize);
                this._builder.render(this._config);
                this._applyTrayOnly();
            });
        } else {
            log('material-panel: no colorSource (fixed palette), skipping matugen watch');
        }
    }

    disable() {
        if (this._sizeDebounceId) {
            GLib.source_remove(this._sizeDebounceId);
            this._sizeDebounceId = 0;
        }
        this._configStore.unwatch();
        this._configStore = null;

        this._theme.destroy();
        this._theme = null;

        this._builder.destroy();
        this._builder = null;

        this._bridge.disable();
        this._bridge = null;

        Main.panel.show();

        this._config = null;
    }
}
