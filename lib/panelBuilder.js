import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Zone} from './zone.js';
import {resolveBuiltin, hasBuiltin} from './moduleRegistry.js';

const ZONE_NAMES = ['left', 'center', 'right'];
const EXTENSION_PREFIX = 'extension:';

export class PanelBuilder {
    constructor(bridge, extensionPath) {
        this._bridge = bridge;
        this._extensionPath = extensionPath;
        this._panelActor = null;
        this._zones = {};
        this._monitorsId = 0;
        this._workareasId = 0;
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
        const scale = config.panelSize?.scale ?? 1.0;
        const layoutStyle = config.layoutStyle ?? 'default';
        this._layoutStyle = layoutStyle;
        this._configRef = config;
        const hiddenModules = new Set(config.hiddenModules ?? []);
        this._bridge.clearClaims();

        // end-4: zone actors shrink-wrap into floating BarGroups
        const expandZones = layoutStyle !== 'end4';

        try {
            this._panelActor.add_style_class_name(
                layoutStyle === 'end4' ? 'material-panel-layout-end4' : 'material-panel-layout-default');
        } catch (e) {}

        for (const zoneName of ZONE_NAMES) {
            const zone = new Zone(zoneName, {expand: expandZones});
            this._zones[zoneName] = zone;
            this._panelActor.add_child(zone.actor);

            for (const id of preset.zones[zoneName] ?? []) {
                if (hiddenModules.has(id)) continue;
                this._place(zone, id, scale);
            }
        }

        this._bridge.setZones(this._zones);
        this._bridge.setFallbackZone(this._zones.right);
        this._bridge.reattachAll();

        Main.layoutManager.addChrome(this._panelActor, {
            affectsStruts: true,
            trackFullscreen: true,
        });
        this._syncGeometry();
        this._ensureGeometryWatch();
    }

    _syncGeometry() {
        if (!this._panelActor)
            return;
        let width = global.stage.width;
        let x = 0;
        try {
            const monitor = Main.layoutManager.primaryMonitor;
            if (monitor) {
                width = monitor.width;
                x = monitor.x;
            }
        } catch (e) {}

        // end-4 floating: horizontal inset like hyprland gaps-out
        let gapSide = 0;
        try {
            const ps = this._configRef?.panelSize ?? {};
            gapSide = Number(ps.gapSide);
            if (!Number.isFinite(gapSide))
                gapSide = (this._layoutStyle === 'end4') ? 14 : 0;
            gapSide = Math.max(0, Math.min(48, Math.round(gapSide)));
        } catch (e) {
            gapSide = this._layoutStyle === 'end4' ? 14 : 0;
        }

        this._panelActor.set_position(x + gapSide, 0);
        this._panelActor.width = Math.max(100, width - 2 * gapSide);
    }

    _ensureGeometryWatch() {
        if (this._monitorsId)
            return;
        try {
            this._monitorsId = Main.layoutManager.connect('monitors-changed', () => {
                this._syncGeometry();
            });
        } catch (e) {}
        try {
            // workareas-changed fires on scale / strut updates
            this._workareasId = global.display.connect('workareas-changed', () => {
                this._syncGeometry();
            });
        } catch (e) {
            try {
                this._workareasId = Main.layoutManager.connect('workareas-changed', () => {
                    this._syncGeometry();
                });
            } catch (e2) {}
        }
    }

    _dropGeometryWatch() {
        if (this._monitorsId) {
            try { Main.layoutManager.disconnect(this._monitorsId); } catch (e) {}
            this._monitorsId = 0;
        }
        if (this._workareasId) {
            try { global.display.disconnect(this._workareasId); } catch (e) {}
            try { Main.layoutManager.disconnect(this._workareasId); } catch (e) {}
            this._workareasId = 0;
        }
    }

    _place(zone, id, scale) {
        if (id.startsWith(EXTENSION_PREFIX)) {
            const role = id.slice(EXTENSION_PREFIX.length);
            this._bridge.setClaim(role, zone);
            return;
        }
        const actor = resolveBuiltin(id, this._extensionPath, scale);
        if (actor) {
            zone.add(actor);
        } else if (!hasBuiltin(id)) {
            logError(new Error(`material-panel: unknown module id "${id}"`));
        }
        // else: a registered module deliberately returned null (e.g. no
        // battery present on this machine) - nothing to place, not an error.
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
        this._dropGeometryWatch();
        this._bridge.detachAll();
        this._teardown();
    }
}
