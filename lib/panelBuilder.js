import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Zone} from './zone.js';
import {resolveBuiltin, hasBuiltin} from './moduleRegistry.js';
import {buildHugCorners, cornerSizeForScale} from './barCorners.js';

const ZONE_NAMES = ['left', 'center', 'right'];
const EXTENSION_PREFIX = 'extension:';

/** end-4 visual groups (order matches ref crop) */
// Match real end-4 bar crop (L → R):
// focused | resources(cpu,net)+media | workspaces | clock | …… | weather + tray + volume + battery + QS
const END4_GROUPS = [
    ['focusedWindow'],
    ['cpu', 'networkSpeed', 'media'],
    ['workspaces'],
    ['clock'],
];

const END4_RIGHT = ['weather', 'notifications', 'volume', 'battery', 'quicksettings'];

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

        const preset = config.presets?.[config.activePreset] ?? config.presets?.default;
        const scale = config.panelSize?.scale ?? 1.0;
        const layoutStyle = config.layoutStyle ?? 'default';
        this._layoutStyle = layoutStyle;
        this._configRef = config;
        const hiddenModules = new Set(config.hiddenModules ?? []);
        this._bridge.clearClaims();

        const isEnd4 = layoutStyle === 'end4';

        this._panelActor = new St.BoxLayout({
            style_class: isEnd4
                ? 'material-panel-bar material-panel-layout-end4'
                : 'material-panel-bar material-panel-layout-default',
            vertical: true,
            x_expand: true,
        });

        if (isEnd4)
            this._renderEnd4(preset, scale, hiddenModules);
        else
            this._renderDefault(preset, scale, hiddenModules);

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

    _renderDefault(preset, scale, hiddenModules) {
        const contentRow = new St.Widget({
            style_class: 'material-panel-bar-content',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });

        for (const zoneName of ZONE_NAMES) {
            const zone = new Zone(zoneName, {expand: true});
            this._zones[zoneName] = zone;
            contentRow.add_child(zone.actor);
            for (const id of preset?.zones?.[zoneName] ?? []) {
                if (hiddenModules.has(id))
                    continue;
                this._place(zone, id, scale);
            }
        }
        this._panelActor.add_child(contentRow);
    }

    /**
     * end-4: continuous strip + BarGroups + hug corners.
     * Groups (L→R): focused | cpu+media | workspaces | clock+weather | spacer | right status
     */
    _renderEnd4(preset, scale, hiddenModules) {
        const contentRow = new St.BoxLayout({
            style_class: 'material-panel-bar-content material-panel-bar-content-end4',
            vertical: false,
            x_expand: true,
            y_expand: false,
        });
        try {
            const col = globalThis._materialPanelBarColor ?? '#1e1e2e';
            contentRow.style = `background-color: ${col}; spacing: 8px;`;
        } catch (e) {}

        // Placeholder zones for bridge (left/center unused for modules)
        this._zones.left = new Zone('left', {expand: false});
        this._zones.center = new Zone('center', {expand: false});
        this._zones.left.actor.visible = false;
        this._zones.center.actor.visible = false;

        const mkGroup = () => {
            const g = new St.BoxLayout({
                style_class: 'material-panel-bargroup',
                vertical: false,
                y_align: Clutter.ActorAlign.CENTER,
            });
            try {
                g.style = 'background-color: rgba(255,255,255,0.07); border-radius: 999px; padding: 1px 6px; spacing: 4px;';
            } catch (e) {}
            try { g.x_expand = false; g.x_align = Clutter.ActorAlign.START; } catch (e) {}
            return g;
        };

        for (const ids of END4_GROUPS) {
            const g = mkGroup();
            let count = 0;
            for (const id of ids) {
                if (hiddenModules.has(id))
                    continue;
                if (id.startsWith(EXTENSION_PREFIX))
                    continue;
                const actor = resolveBuiltin(id, this._extensionPath, scale);
                if (actor) {
                    g.add_child(actor);
                    count++;
                }
            }
            if (count > 0)
                contentRow.add_child(g);
        }

        const spacer = new St.Widget({
            style_class: 'material-panel-bar-spacer',
            x_expand: true,
            y_expand: true,
        });
        contentRow.add_child(spacer);

        // Right cluster: system modules + foreign tray
        const rightZone = new Zone('right', {expand: false});
        this._zones.right = rightZone;
        try {
            rightZone.actor.style =
                'background-color: rgba(255,255,255,0.06); border-radius: 999px; padding: 2px 8px; spacing: 4px;';
        } catch (e) {}
        contentRow.add_child(rightZone.actor);

        for (const id of END4_RIGHT) {
            if (hiddenModules.has(id))
                continue;
            this._place(rightZone, id, scale);
        }

        this._panelActor.add_child(contentRow);

        const csize = cornerSizeForScale(scale);
        const color = globalThis._materialPanelBarColor ?? '#1e1e2e';
        this._corners = buildHugCorners(csize, color);
        this._panelActor.add_child(this._corners);
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
