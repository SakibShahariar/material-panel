import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore} from './lib/configStore.js';
import {PanelBuilder} from './lib/panelBuilder.js';
import {StatusAreaBridge} from './lib/statusAreaBridge.js';
import {ThemeManager} from './lib/theme.js';

export default class MaterialPanelExtension extends Extension {
    enable() {
        this._configStore = new ConfigStore();
        this._config = this._configStore.load();

        this._bridge = new StatusAreaBridge();
        this._bridge.enable();

        this._builder = new PanelBuilder(this._bridge, this.path);
        this._theme = new ThemeManager(this.path);

        // Theme (CSS + regenerated icon SVGs) must be applied before the
        // panel is built, since modules load icons from the paths theme.js
        // just wrote. _applyTheme() does both, in that order.
        this._applyTheme();

        // NOTE: we hide the stock panel rather than destroy it. Main.panel
        // is a singleton other extensions reference directly (addToStatusArea,
        // sometimes Main.panel._rightBox etc). Destroying it breaks them.
        // hide() keeps it alive as a backing object (so addToStatusArea still
        // works) while fully excluding it from layout, painting, and Clutter's
        // event picking. Chrome/workarea tracking already skips invisible
        // actors, so we get the screen space back for free.
        //
        // Do NOT switch this to height=0/opacity=0/reactive=false — that
        // leaves the actor in the pick pipeline with a degenerate zero-size
        // allocation, which throws "StWidget doesn't implement event" on
        // every pointer event near the top of the screen and can leave
        // GNOME's own DateMenu half-initialized.
        Main.panel.hide();

        this._configStore.watch(newConfig => {
            this._config = newConfig;
            this._applyTheme();
        });
    }

    // Applies CSS + regenerates icon SVGs, then rebuilds the panel so any
    // icon actors pick up the freshly-written files. Called on enable(),
    // on config.json changes, and on matugen output changes.
    _applyTheme() {
        this._theme.apply(this._config.colorSource ?? null);
        this._builder.render(this._config);
        if (this._config.colorSource) {
            this._theme.watch(this._config.colorSource, () => {
                this._theme.apply(this._config.colorSource);
                this._builder.render(this._config);
            });
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

