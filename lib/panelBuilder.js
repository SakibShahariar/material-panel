import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Zone} from './zone.js';
import {resolveBuiltin, hasBuiltin} from './moduleRegistry.js';
import {buildHugCorners, cornerSizeForScale} from './barCorners.js';

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
        this._layoutStyle = 'default';
        this._configRef = null;
        this._corners = null;
    }

    render(config) {
        this._bridge.detachAll();
        this._teardown();

        const preset = config.presets[config.activePreset];
        const scale = config.panelSize?.scale ?? 1.0;
        const layoutStyle = config.layoutStyle ?? 'default';
        this._layoutStyle = layoutStyle;
        this._configRef = config;
        const hiddenModules = new Set(config.hiddenModules ?? []);
        this._bridge.clearClaims();

        const isEnd4 = layoutStyle === 'end4';

        // Outer chrome actor (struts / geometry)
        this._panelActor = new St.BoxLayout({
            style_class: isEnd4
                ? 'material-panel-bar material-panel-layout-end4'
                : 'material-panel-bar material-panel-layout-default',
            vertical: true,
            x_expand: true,
        });

        // Content row
        let contentRow;
        if (isEnd4) {
            // Continuous horizontal strip — zones expand in one row (not islands)
            contentRow = new St.BoxLayout({
                style_class: 'material-panel-bar-content material-panel-bar-content-end4',
                vertical: false,
                x_expand: true,
                y_expand: false,
            });
        } else {
            contentRow = new St.Widget({
                style_class: 'material-panel-bar-content',
                layout_manager: new Clutter.BinLayout(),
                x_expand: true,
                y_expand: true,
            });
        }

        for (const zoneName of ZONE_NAMES) {
            // end4: expand so groups sit in the continuous bar
            // default: expand with BinLayout alignment (classic)
            const zone = new Zone(zoneName, {expand: true});
            this._zones[zoneName] = zone;

            if (isEnd4) {
                // keep zone shrink-to-content horizontally for group pills, but
                // left/right stay at ends via spacer in center
                zone.actor.x_expand = zoneName === 'center';
                zone.actor.x_align = zoneName === 'left'
                    ? Clutter.ActorAlign.START
                    : zoneName === 'right'
                        ? Clutter.ActorAlign.END
                        : Clutter.ActorAlign.CENTER;
            }

            contentRow.add_child(zone.actor);

            for (const id of preset.zones[zoneName] ?? []) {
                if (hiddenModules.has(id))
                    continue;
                this._place(zone, id, scale);
            }
        }

        this._panelActor.add_child(contentRow);

        // Hug round decorators under the bar (end-4 only)
        if (isEnd4) {
            const csize = cornerSizeForScale(scale);
            const color = globalThis._materialPanelBarColor
                ?? 'rgba(28, 22, 36, 0.92)';
            this._corners = buildHugCorners(csize, color);
            this._panelActor.add_child(this._corners);
        } else {
            this._corners = null;
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

        let gapSide = 0;
        try {
            const ps = this._configRef?.panelSize ?? {};
            gapSide = Number(ps.gapSide);
            if (!Number.isFinite(gapSide))
                gapSide = 0;
            // end4 Hug = full width (0); Float would use gapSide
            if (this._layoutStyle === 'end4' && gapSide > 0) {
                // optional float inset only when user set gapSide
            } else if (this._layoutStyle !== 'end4') {
                gapSide = 0;
            }
            gapSide = Math.max(0, Math.min(48, Math.round(gapSide)));
        } catch (e) {
            gapSide = 0;
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
    }

    _teardown() {
        this._corners = null;
        if (this._panelActor) {
            Main.layoutManager.removeChrome(this._panelActor);
            this._panelActor.destroy();
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
