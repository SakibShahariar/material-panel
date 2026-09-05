import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Zone} from './zone.js';
import {resolveBuiltin, hasBuiltin} from './moduleRegistry.js';
import {buildHugCorners, cornerSizeForScale} from './barCorners.js';

const ZONE_NAMES = ['left', 'center', 'right'];
const EXTENSION_PREFIX = 'extension:';

/**
 * end-4 placement — TRUE three zones (center is screen-center, not left-packed):
 *
 *   LEFT:   focused | resources (cpu, net) | media
 *   CENTER: workspaces | clock          ← middle of the monitor
 *   RIGHT:  weather | noti | volume | battery | QS | foreign tray
 */
const END4_LEFT = ['focusedWindow', 'cpu', 'networkSpeed', 'media'];
const END4_CENTER = ['workspaces', 'clock'];
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
            this._renderEnd4(scale, hiddenModules);
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
     * BinLayout so CENTER is the real horizontal middle of the screen.
     * BarGroups (soft pills) wrap each logical cluster.
     */
    _renderEnd4(scale, hiddenModules) {
        const contentRow = new St.Widget({
            style_class: 'material-panel-bar-content material-panel-bar-content-end4',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        try {
            const col = globalThis._materialPanelBarColor ?? '#1e1e2e';
            contentRow.style = `background-color: ${col};`;
        } catch (e) {}

        const mkGroup = () => {
            const g = new St.BoxLayout({
                style_class: 'material-panel-bargroup',
                vertical: false,
                y_align: Clutter.ActorAlign.CENTER,
            });
            try {
                g.style =
                    'background-color: rgba(255,255,255,0.07); border-radius: 999px; padding: 1px 6px; spacing: 4px;';
            } catch (e) {}
            return g;
        };

        // LEFT zone — start
        const leftZone = new Zone('left', {expand: false});
        this._zones.left = leftZone;
        try {
            leftZone.actor.x_align = Clutter.ActorAlign.START;
            leftZone.actor.y_align = Clutter.ActorAlign.CENTER;
            leftZone.actor.x_expand = true;
            leftZone.actor.style = 'spacing: 8px; padding-left: 8px;';
        } catch (e) {}

        // focused alone
        const gFocus = mkGroup();
        this._fillGroup(gFocus, ['focusedWindow'], scale, hiddenModules);
        if (gFocus.get_n_children() > 0)
            leftZone.actor.add_child(gFocus);

        // resources + media
        const gRes = mkGroup();
        this._fillGroup(gRes, ['cpu', 'networkSpeed', 'media'], scale, hiddenModules);
        if (gRes.get_n_children() > 0)
            leftZone.actor.add_child(gRes);

        contentRow.add_child(leftZone.actor);

        // CENTER zone — true middle of the bar
        const centerZone = new Zone('center', {expand: false});
        this._zones.center = centerZone;
        try {
            centerZone.actor.x_align = Clutter.ActorAlign.CENTER;
            centerZone.actor.y_align = Clutter.ActorAlign.CENTER;
            centerZone.actor.x_expand = false;
            centerZone.actor.style = 'spacing: 8px;';
        } catch (e) {}

        const gWs = mkGroup();
        this._fillGroup(gWs, ['workspaces'], scale, hiddenModules);
        if (gWs.get_n_children() > 0)
            centerZone.actor.add_child(gWs);

        const gClock = mkGroup();
        this._fillGroup(gClock, ['clock'], scale, hiddenModules);
        if (gClock.get_n_children() > 0)
            centerZone.actor.add_child(gClock);

        contentRow.add_child(centerZone.actor);

        // RIGHT zone — end
        const rightZone = new Zone('right', {expand: false});
        this._zones.right = rightZone;
        try {
            rightZone.actor.x_align = Clutter.ActorAlign.END;
            rightZone.actor.y_align = Clutter.ActorAlign.CENTER;
            rightZone.actor.x_expand = true;
            rightZone.actor.style =
                'spacing: 6px; padding-right: 8px;';
        } catch (e) {}

        const gRight = mkGroup();
        this._fillGroup(gRight, END4_RIGHT, scale, hiddenModules);
        if (gRight.get_n_children() > 0)
            rightZone.actor.add_child(gRight);

        contentRow.add_child(rightZone.actor);

        this._panelActor.add_child(contentRow);

        const csize = cornerSizeForScale(scale);
        const color = globalThis._materialPanelBarColor ?? '#1e1e2e';
        this._corners = buildHugCorners(csize, color);
        this._panelActor.add_child(this._corners);

        try {
            log('material-panel: end4 placement LEFT|CENTER|RIGHT (BinLayout center)');
        } catch (e) {}
    }

    _fillGroup(group, ids, scale, hiddenModules) {
        for (const id of ids) {
            if (hiddenModules.has(id))
                continue;
            if (id.startsWith(EXTENSION_PREFIX))
                continue;
            const actor = resolveBuiltin(id, this._extensionPath, scale);
            if (actor)
                group.add_child(actor);
        }
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
