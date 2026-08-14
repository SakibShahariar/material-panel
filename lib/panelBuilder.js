import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Zone} from './zone.js';
import {resolveBuiltin} from './moduleRegistry.js';

const ZONE_NAMES = ['left', 'center', 'right'];
const EXTENSION_PREFIX = 'extension:';

export class PanelBuilder {
    constructor(bridge) {
        this._bridge = bridge;
        this._panelActor = null;
        this._zones = {};
    }

    // Always a full rebuild, never an incremental patch. This keeps
    // preset-switching, live config reloads, and (eventually) a live editor
    // all going through the exact same code path.
    render(config) {
        this._bridge.detachAll();
        this._teardown();

        // St.Widget + Clutter.BinLayout instead of St.BoxLayout: BinLayout
        // stacks children in the same coordinate space and positions each
        // independently by its own x_align, rather than laying them out in
        // a row. That's what makes the center zone's midpoint the panel's
        // true midpoint, regardless of how wide the left/right zones are.
        this._panelActor = new St.Widget({
            style_class: 'material-panel-bar',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
        });

        const preset = config.presets[config.activePreset];
        this._bridge.clearClaims();

        for (const zoneName of ZONE_NAMES) {
            const zone = new Zone(zoneName);
            this._zones[zoneName] = zone;
            this._panelActor.add_child(zone.actor);

            for (const id of preset.zones[zoneName] ?? [])
                this._place(zone, id);
        }

        this._bridge.setFallbackZone(this._zones.right);
        this._bridge.reattachAll();

        Main.layoutManager.addChrome(this._panelActor, {
            affectsStruts: true,
            trackFullscreen: true,
        });
        this._panelActor.set_position(0, 0);
        this._panelActor.width = global.stage.width;
    }

    _place(zone, id) {
        if (id.startsWith(EXTENSION_PREFIX)) {
            const role = id.slice(EXTENSION_PREFIX.length);
            this._bridge.setClaim(role, zone);
            return;
        }
        const actor = resolveBuiltin(id);
        if (actor)
            zone.add(actor);
        else
            logError(new Error(`material-panel: unknown module id "${id}"`));
    }

    _teardown() {
        if (this._panelActor) {
            Main.layoutManager.removeChrome(this._panelActor);
            this._panelActor.destroy(); // safe: bridged actors already detached above
            this._panelActor = null;
        }
        this._zones = {};
    }

    destroy() {
        this._bridge.detachAll();
        this._teardown();
    }
}
