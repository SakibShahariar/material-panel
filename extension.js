import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore} from './lib/configStore.js';
import {PanelBuilder} from './lib/panelBuilder.js';
import {StatusAreaBridge} from './lib/statusAreaBridge.js';

export default class MaterialPanelExtension extends Extension {
    enable() {
        this._configStore = new ConfigStore();
        this._config = this._configStore.load();

        this._bridge = new StatusAreaBridge();
        this._bridge.enable();

        this._builder = new PanelBuilder(this._bridge);
        this._builder.render(this._config);

        // NOTE: we hide the stock panel rather than destroy it. Main.panel
        // is a singleton other extensions reference directly (addToStatusArea,
        // sometimes Main.panel._rightBox etc). Destroying it breaks them.
        // Hiding + zero-height keeps it alive as a backing object while our
        // own panel actor is what's actually visible.
        //
        // KNOWN LIMITATION: setting height to 0 here can confuse
        // Main.layoutManager's workarea calculations in some GNOME versions,
        // since it partly derives strut size from the stock panel's box.
        // If you see gaps/overlaps with maximized windows, this is the first
        // place to look.
        Main.panel.height = 0;
        Main.panel.opacity = 0;
        Main.panel.reactive = false;

        this._configStore.watch(newConfig => {
            this._config = newConfig;
            this._builder.render(this._config);
        });
    }

    disable() {
        this._configStore.unwatch();
        this._configStore = null;

        this._builder.destroy();
        this._builder = null;

        this._bridge.disable();
        this._bridge = null;

        Main.panel.height = -1;
        Main.panel.opacity = 255;
        Main.panel.reactive = true;

        this._config = null;
    }
}
