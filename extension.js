import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore, resolveColorSource} from './lib/configStore.js';
import {PanelBuilder} from './lib/panelBuilder.js';
import {StatusAreaBridge} from './lib/statusAreaBridge.js';
import {ThemeManager} from './lib/theme.js';

/** True if only tray-related keys changed (no panel rebuild needed). */
function isTrayOnlyChange(prev, next) {
    if (!prev || !next)
        return false;
    const strip = c => {
        const o = JSON.parse(JSON.stringify(c));
        delete o.trayAllHidden;
        delete o.foreignRoleZones;
        delete o.hiddenForeignRoles;
        delete o.foreignRoleZonesBackup;
        return JSON.stringify(o);
    };
    try {
        return strip(prev) === strip(next);
    } catch (e) {
        return false;
    }
}

export default class MaterialPanelExtension extends Extension {
    enable() {
        this._configStore = new ConfigStore();
        this._config = this._configStore.load();

        this._bridge = new StatusAreaBridge();
        this._bridge.enable();

        this._builder = new PanelBuilder(this._bridge, this.path);
        this._theme = new ThemeManager(this.path);

        // Full build once
        this._applyTheme();

        Main.panel.hide();

        this._configStore.watch(newConfig => {
            const prev = this._config;
            this._config = newConfig;

            // CRITICAL: hide-all / Left-Right must NOT rebuild the whole panel.
            // Full render was destroying builtins + QS after a few toggles.
            if (isTrayOnlyChange(prev, newConfig)) {
                log('material-panel: tray-only config change — bridge update, no rebuild');
                this._applyTrayOnly();
                return;
            }

            log('material-panel: layout/theme config change — full rebuild');
            this._applyTheme();
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

    // Full theme + panel rebuild (enable, module layout, size, colors)
    _applyTheme() {
        const panelSize = this._config.panelSize ?? {};
        const colorSource = resolveColorSource(this._config.colorSource);
        this._theme.apply(colorSource, panelSize);
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
