import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Never adopt / hide these — GNOME chrome or names that could collide with our modules
const ROLE_BLOCKLIST = new Set([
    'activities', 'dateMenu', 'quickSettings', 'a11y', 'keyboard',
    'dwellClick', 'screenRecording', 'screenSharing', 'thunderbolt',
    'remoteAccess', 'workspaceIndicator', 'panelMenu',
    // Built-in Material Panel module ids (must never be treated as tray roles)
    'workspaces', 'cpu', 'networkSpeed', 'clock', 'weather', 'notifications',
    'battery', 'volume', 'network', 'darkmode', 'nightlight', 'dnd',
    'powermenu', 'bluetooth', 'quicksettings',
]);

function isBlockedRole(role) {
    if (!role) return true;
    if (ROLE_BLOCKLIST.has(role)) return true;
    if (role.startsWith('appIndicator-') && role.includes('-placeholder'))
        return true;
    return false;
}

function isMaterialPanelActor(actor) {
    if (!actor)
        return false;
    try {
        const sc = actor.get_style_class_name?.() ?? actor.style_class ?? '';
        if (String(sc).includes('material-panel'))
            return true;
    } catch (e) {}
    try {
        // Walk one level of children (chip wrappers)
        const kids = actor.get_children?.() ?? [];
        for (const k of kids) {
            const sc = k.get_style_class_name?.() ?? k.style_class ?? '';
            if (String(sc).includes('material-panel-'))
                return true;
        }
    } catch (e) {}
    return false;
}

function rolesFilePath() {
    return GLib.build_filenamev(
        [GLib.get_home_dir(), '.config', 'material-panel', 'status-roles.json']);
}

export class StatusAreaBridge {
    constructor() {
        this._originalAddToStatusArea = null;
        this._claims = new Map();
        this._mounted = new Map();
        this._wrappers = new Map();
        this._adopted = new Set();
        this._zones = null;
        this._fallbackZone = null;
        this._hiddenBlocked = new Set();
        // role -> 'left' | 'right' | 'center' | 'hidden'
        this._roleZones = new Map();
    }

    enable() {
        this._originalAddToStatusArea = Main.panel.addToStatusArea.bind(Main.panel);
        const self = this;
        Main.panel.addToStatusArea = function (role, indicator, position, box) {
            const button = self._originalAddToStatusArea(role, indicator, position, box);
            self._onButtonAdded(role, button ?? indicator);
            return button;
        };
        try {
            const area = Main.panel.statusArea ?? {};
            for (const role of Object.keys(area)) {
                if (area[role])
                    this._onButtonAdded(role, area[role]);
            }
        } catch (e) {}
    }

    disable() {
        for (const role of this._hiddenBlocked) {
            const actor = this._mounted.get(role) ?? Main.panel.statusArea?.[role];
            try {
                if (actor && !isMaterialPanelActor(actor))
                    actor.visible = true;
            } catch (e) {}
        }
        this._hiddenBlocked.clear();

        for (const role of this._adopted) {
            const actor = this._mounted.get(role);
            if (!actor) continue;
            try {
                this._unwrap(role);
                const parent = actor.get_parent();
                if (parent) parent.remove_child(actor);
                this._originalAddToStatusArea(role, actor);
            } catch (e) {
                logError(e, `material-panel: restore role "${role}"`);
            }
        }
        for (const role of [...this._mounted.keys()]) {
            try { this._unwrap(role); } catch (e) {}
        }

        if (this._originalAddToStatusArea)
            Main.panel.addToStatusArea = this._originalAddToStatusArea;
        this._originalAddToStatusArea = null;
        this._mounted.clear();
        this._wrappers.clear();
        this._adopted.clear();
        this._claims.clear();
        this._fallbackZone = null;
        this._zones = null;
        this._roleZones.clear();
    }

    setForeignPlacements(map, legacyHidden = []) {
        this._roleZones.clear();
        const src = map && typeof map === 'object' ? map : {};
        for (const [role, zone] of Object.entries(src)) {
            if (['left', 'right', 'center', 'hidden'].includes(zone))
                this._roleZones.set(role, zone);
        }
        for (const role of legacyHidden ?? []) {
            if (!this._roleZones.has(role))
                this._roleZones.set(role, 'hidden');
        }
        for (const [role, actor] of this._mounted.entries())
            this._reparent(role, actor);
        this._persistRolesFile();
    }

    setUserHiddenRoles(roles) {
        for (const role of roles ?? [])
            this._roleZones.set(role, 'hidden');
        for (const [role, actor] of this._mounted.entries())
            this._reparent(role, actor);
        this._persistRolesFile();
    }

    clearClaims() {
        this._claims.clear();
    }

    setClaim(role, zone) {
        this._tryAdopt(role);
        this._claims.set(role, zone);
    }

    setFallbackZone(zone) {
        this._fallbackZone = zone;
    }

    setZones(zones) {
        this._zones = zones;
    }

    _tryAdopt(role) {
        if (this._mounted.has(role)) return;
        const actor = Main.panel.statusArea?.[role];
        if (actor) {
            this._adopted.add(role);
            this._onButtonAdded(role, actor);
        }
    }

    detachAll() {
        for (const [role] of this._mounted.entries()) {
            if (isBlockedRole(role)) continue;
            const wrap = this._wrappers.get(role);
            if (!wrap) continue;
            try {
                const parent = wrap.get_parent();
                if (parent) parent.remove_child(wrap);
            } catch (e) {}
        }
    }

    reattachAll() {
        const roles = [...this._mounted.keys()].filter(r => !isBlockedRole(r));
        const left = [], right = [], center = [], hidden = [];
        for (const role of roles) {
            const p = this._placementFor(role);
            if (p === 'left') left.push(role);
            else if (p === 'center') center.push(role);
            else if (p === 'hidden') hidden.push(role);
            else right.push(role);
        }
        left.sort();
        right.sort();
        center.sort();
        for (const role of hidden) {
            const a = this._mounted.get(role);
            if (a) this._reparent(role, a);
        }
        for (const role of left) {
            const a = this._mounted.get(role);
            if (a) this._reparent(role, a);
        }
        for (const role of center) {
            const a = this._mounted.get(role);
            if (a) this._reparent(role, a);
        }
        for (const role of right.slice().reverse()) {
            const a = this._mounted.get(role);
            if (a) this._reparent(role, a);
        }
        this._persistRolesFile();
    }

    /**
     * Priority: explicit claim from preset (extension:role) > foreignRoleZones > hidden
     * Unclaimed and unset → hidden (do not auto-dump onto the panel).
     */
    _placementFor(role) {
        const claimed = this._claims.get(role);
        if (claimed?.name === 'left' || claimed?.name === 'right' || claimed?.name === 'center')
            return claimed.name;
        if (this._roleZones.has(role))
            return this._roleZones.get(role);
        return 'hidden';
    }

    _onButtonAdded(role, actor) {
        if (!actor || !role) return;
        if (isMaterialPanelActor(actor)) {
            log(`material-panel: skip adopt material-panel actor role="${role}"`);
            return;
        }
        if (isBlockedRole(role)) {
            this._mounted.set(role, actor);
            try {
                actor.visible = false;
                this._hiddenBlocked.add(role);
            } catch (e) {}
            return;
        }
        this._mounted.set(role, actor);
        log(`material-panel: status area role added: "${role}"`);
        this._reparent(role, actor);
        this._persistRolesFile();
    }

    _ensureWrapper(role, actor) {
        if (isMaterialPanelActor(actor))
            return null;

        let wrap = this._wrappers.get(role);
        if (wrap) {
            try {
                if (wrap.get_children().includes(actor))
                    return wrap;
            } catch (e) {}
            try {
                if (actor.get_parent() === wrap)
                    wrap.remove_child(actor);
                wrap.destroy();
            } catch (e) {}
            this._wrappers.delete(role);
        }

        wrap = new St.BoxLayout({
            style_class: 'material-panel-chip material-panel-foreign',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });
        try {
            const parent = actor.get_parent();
            if (parent) parent.remove_child(actor);
        } catch (e) {}
        try {
            if (actor.add_style_class_name)
                actor.add_style_class_name('material-panel-foreign-inner');
            if (actor.set_style)
                actor.set_style(
                    'background-color: transparent; border: none; box-shadow: none; padding: 0; margin: 0;');
        } catch (e) {}
        wrap.add_child(actor);
        this._wrappers.set(role, wrap);
        return wrap;
    }

    _unwrap(role) {
        const actor = this._mounted.get(role);
        const wrap = this._wrappers.get(role);
        if (!wrap) return;
        try {
            if (actor && actor.get_parent() === wrap)
                wrap.remove_child(actor);
        } catch (e) {}
        try {
            const parent = wrap.get_parent();
            if (parent) parent.remove_child(wrap);
            wrap.destroy();
        } catch (e) {}
        this._wrappers.delete(role);
        try {
            if (actor?.remove_style_class_name)
                actor.remove_style_class_name('material-panel-foreign-inner');
            if (actor?.set_style)
                actor.set_style('');
        } catch (e) {}
    }

    _resolveZone(placement) {
        if (this._zones) {
            if (placement === 'left') return this._zones.left ?? null;
            if (placement === 'center') return this._zones.center ?? null;
            if (placement === 'right') return this._zones.right ?? this._fallbackZone;
        }
        return this._fallbackZone;
    }

    _reparent(role, actor) {
        if (isMaterialPanelActor(actor))
            return;
        if (isBlockedRole(role)) {
            try {
                actor.visible = false;
                this._hiddenBlocked.add(role);
            } catch (e) {}
            return;
        }

        const placement = this._placementFor(role);
        if (placement === 'hidden') {
            try {
                this._unwrap(role);
                const parent = actor.get_parent();
                if (parent) parent.remove_child(actor);
                actor.visible = false;
            } catch (e) {}
            return;
        }

        const zone = this._resolveZone(placement);
        if (!zone) return;

        try {
            const wrap = this._ensureWrapper(role, actor);
            if (!wrap) return;
            try { actor.visible = true; } catch (e) {}
            const parent = wrap.get_parent();
            if (parent) parent.remove_child(wrap);

            if (placement === 'right' && typeof zone.addStart === 'function')
                zone.addStart(wrap);
            else
                zone.add(wrap);
        } catch (e) {
            logError(e, `material-panel: reparent "${role}"`);
        }
    }

    _persistRolesFile() {
        try {
            const roles = this.getMountedRoles().sort();
            const path = rolesFilePath();
            const dir = Gio.File.new_for_path(GLib.path_get_dirname(path));
            if (!dir.query_exists(null))
                dir.make_directory_with_parents(null);
            Gio.File.new_for_path(path).replace_contents(
                JSON.stringify(roles, null, 2), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            logError(e, 'material-panel: write status-roles.json');
        }
    }

    getUnclaimedRoles() {
        return [...this._mounted.keys()].filter(
            role => !this._claims.has(role) && !isBlockedRole(role));
    }

    getMountedRoles() {
        return [...this._mounted.keys()].filter(role => !isBlockedRole(role));
    }
}
