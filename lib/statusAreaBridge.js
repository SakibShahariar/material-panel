import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Model B: opt-in only.
// - Default: do NOT move indicators off the stock panel.
// - Stock panel is hidden as a whole while Material Panel runs.
// - Tray prefs Left/Right/Center = show on OUR panel (reparent).
// - Hidden / unset = leave on stock (not visible while stock is hidden).
// - Hide-all = temporary: treat every role as not on our panel.
// - Disable = return only roles we actually adopted.

const ROLE_BLOCKLIST = new Set([
    // Never adopt GNOME chrome into Material Panel
    'activities', 'dateMenu', 'quickSettings', 'a11y', 'keyboard',
    'dwellClick', 'screenRecording', 'screenSharing', 'thunderbolt',
    'remoteAccess', 'workspaceIndicator', 'panelMenu',
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
    if (!actor) return false;
    try {
        const sc = String(actor.get_style_class_name?.() ?? actor.style_class ?? '');
        if (!sc.includes('material-panel'))
            return false;
        if (sc.includes('material-panel-foreign'))
            return false;
        return true;
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
        this._known = new Map();      // role -> actor (seen, not necessarily adopted)
        this._wrappers = new Map();
        this._onOurPanel = new Set(); // roles currently reparented onto Material Panel
        this._zones = null;
        this._fallbackZone = null;
        this._roleZones = new Map();  // explicit opt-in: left|right|center|hidden
        this._allHidden = false;
        this._weHidActor = new Set();
        this._actorSignals = new Map();
        this._roleOrigin = new Map(); // role -> {box, position}
    }

    enable() {
        this._originalAddToStatusArea = Main.panel.addToStatusArea.bind(Main.panel);
        const self = this;
        Main.panel.addToStatusArea = function (role, indicator, position, box) {
            try {
                self._roleOrigin.set(role, {
                    position: position ?? 1,
                    box: box || 'right',
                });
            } catch (e) {}
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
        // Return only icons we moved onto our panel
        const adopted = [...this._onOurPanel];
        for (const role of adopted) {
            const actor = this._known.get(role) ?? Main.panel.statusArea?.[role];
            if (actor)
                this._returnToStock(role, actor);
        }

        if (this._originalAddToStatusArea)
            Main.panel.addToStatusArea = this._originalAddToStatusArea;
        this._originalAddToStatusArea = null;

        this._known.clear();
        this._wrappers.clear();
        this._onOurPanel.clear();
        this._claims.clear();
        this._fallbackZone = null;
        this._zones = null;
        this._roleZones.clear();
        this._allHidden = false;
        this._weHidActor.clear();
        for (const role of [...this._actorSignals.keys()])
            this._unbindActorSignals(role);
        this._actorSignals.clear();
        this._roleOrigin.clear();
    }

    /**
     * map[role] = left|right|center → opt-in show on Material Panel
     * map[role] = hidden or missing → stay on stock (not on our panel)
     * opts.allHidden → show none on our panel (stock still owns them)
     */
    setForeignPlacements(map, _ignored = [], opts = {}) {
        this._allHidden = !!opts.allHidden;
        this._roleZones.clear();

        const src = map && typeof map === 'object' ? {...map} : {};
        // Keep explicit "hidden" entries — needed so Off can remove icons from our panel.
        // (Do not wipe the map when every value is "hidden".)
        for (const [role, zone] of Object.entries(src)) {
            if (['left', 'right', 'center', 'hidden'].includes(zone))
                this._roleZones.set(role, zone);
        }

        const opted = [...this._roleZones].filter(([, z]) => z !== 'hidden').map(([r]) => r);
        log(`material-panel: tray B opt-in allHidden=${this._allHidden} opted=[${opted.join(',')}] known=${this._known.size}`);

        // Refresh known actors from live statusArea
        try {
            const area = Main.panel.statusArea ?? {};
            for (const role of Object.keys(area)) {
                if (area[role] && !isBlockedRole(role) && !isMaterialPanelActor(area[role]))
                    this._known.set(role, area[role]);
            }
        } catch (e) {}

        // Known + map + currently on our panel (so Off always reclaims chips)
        const roles = new Set([
            ...this._known.keys(),
            ...this._roleZones.keys(),
            ...this._onOurPanel,
        ]);
        for (const role of roles) {
            if (isBlockedRole(role))
                continue;
            let actor = this._known.get(role);
            if (!actor) {
                try {
                    actor = Main.panel.statusArea?.[role] ?? null;
                } catch (e) {
                    actor = null;
                }
            }
            if (!actor) {
                log(`material-panel: tray no actor yet for "${role}"`);
                continue;
            }
            this._known.set(role, actor);
            this._applyRole(role, actor);
        }

        this._persistRolesFile();
    }

    clearClaims() {
        this._claims.clear();
    }

    setClaim(role, zone) {
        // Preset extension:role still counts as opt-in claim
        this._claims.set(role, zone);
        const actor = this._known.get(role) ?? Main.panel.statusArea?.[role];
        if (actor)
            this._applyRole(role, actor);
    }

    setFallbackZone(zone) {
        this._fallbackZone = zone;
    }

    setZones(zones) {
        this._zones = zones;
    }

    detachAll() {
        // Before panel chrome rebuild: temporarily park adopted icons
        // without returning to stock (reattachAll / setForeignPlacements follows)
        for (const role of [...this._onOurPanel]) {
            const wrap = this._wrappers.get(role);
            if (!wrap) continue;
            try {
                const parent = wrap.get_parent();
                if (parent) parent.remove_child(wrap);
            } catch (e) {}
        }
    }

    reattachAll() {
        for (const [role, actor] of this._known.entries())
            this._applyRole(role, actor);
        this._persistRolesFile();
    }

    /** Opt-in placement on our panel, or null = stay on stock. */
    _wantedPlacement(role) {
        if (this._allHidden)
            return null;
        if (isBlockedRole(role))
            return null;

        if (this._roleZones.has(role)) {
            const z = this._roleZones.get(role);
            if (z === 'hidden')
                return null;
            return z;
        }

        const claimed = this._claims.get(role);
        if (claimed?.name === 'left' || claimed?.name === 'right' || claimed?.name === 'center')
            return claimed.name;

        // Default B: not on Material Panel
        return null;
    }

    _onButtonAdded(role, actor) {
        if (!actor || !role) return;
        if (isMaterialPanelActor(actor)) return;
        if (isBlockedRole(role)) {
            this._persistRolesFile();
            return;
        }

        this._known.set(role, actor);
        log(`material-panel: seen tray role "${role}" (opt-in only)`);
        this._applyRole(role, actor);
        this._persistRolesFile();
    }

    _applyRole(role, actor) {
        if (!actor || isBlockedRole(role) || isMaterialPanelActor(actor))
            return;

        const want = this._wantedPlacement(role);
        log(`material-panel: apply "${role}" want=${want} onOur=${this._onOurPanel.has(role)} hasWrap=${this._wrappers.has(role)}`);
        if (!want) {
            // Off / hide-all / not opted-in — must leave our panel if present
            if (this._onOurPanel.has(role) || this._wrappers.has(role))
                this._returnToStock(role, actor);
            return;
        }

        if (!this._zones && !this._fallbackZone) {
            log(`material-panel: zones not ready for "${role}" — retry in 200ms`);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                try {
                    const a = this._known.get(role) ?? Main.panel.statusArea?.[role];
                    if (a) this._applyRole(role, a);
                } catch (e) {}
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        this._adoptToOurPanel(role, actor, want);
    }

    _resolveZone(placement) {
        if (this._zones) {
            if (placement === 'left') return this._zones.left ?? null;
            if (placement === 'center') return this._zones.center ?? null;
            if (placement === 'right') return this._zones.right ?? this._fallbackZone;
        }
        return this._fallbackZone;
    }

    _adoptToOurPanel(role, actor, placement) {
        try {
            const zone = this._resolveZone(placement);
            if (!zone) return;

            const wrap = this._ensureWrapper(role, actor);
            if (!wrap) return;

            const parent = wrap.get_parent();
            if (parent)
                parent.remove_child(wrap);

            if (placement === 'right' && typeof zone.addStart === 'function')
                zone.addStart(wrap);
            else
                zone.add(wrap);

            this._onOurPanel.add(role);
            this._bindActorSignals(role, actor, wrap);
            log(`material-panel: opted-in "${role}" → ${placement}`);
        } catch (e) {
            logError(e, `material-panel: adopt "${role}"`);
        }
    }

    _returnToStock(role, actor) {
        try {
            this._unbindActorSignals(role);
            // Always destroy our chip so Off never leaves an empty/background pill
            try {
                this._unwrap(role);
            } catch (e) {}
            try {
                if (actor) {
                    const parent = actor.get_parent();
                    if (parent)
                        parent.remove_child(actor);
                }
            } catch (e) {}

            if (this._weHidActor.has(role)) {
                try { if (actor) actor.visible = true; } catch (e) {}
                this._weHidActor.delete(role);
            }

            const add = this._originalAddToStatusArea;
            if (actor && typeof add === 'function') {
                try {
                    if (Main.panel.statusArea?.[role] &&
                        Main.panel.statusArea[role] !== actor)
                        delete Main.panel.statusArea[role];
                } catch (e) {}
                const origin = this._roleOrigin.get(role) ?? {};
                try {
                    add.call(Main.panel, role, actor,
                        origin.position ?? 1, origin.box || 'right');
                } catch (e) {
                    try {
                        if (!actor.get_parent() && Main.panel._rightBox)
                            Main.panel._rightBox.add_child(actor);
                    } catch (e2) {}
                }
            }
            this._onOurPanel.delete(role);
            this._wrappers.delete(role);
            log(`material-panel: Off — returned "${role}" to stock`);
        } catch (e) {
            logError(e, `material-panel: returnToStock "${role}"`);
        }
    }

    _unbindActorSignals(role) {
        const rec = this._actorSignals.get(role);
        const actor = this._known.get(role);
        if (!rec) return;
        try {
            if (actor && rec.visId) actor.disconnect(rec.visId);
        } catch (e) {}
        try {
            if (actor && rec.destroyId) actor.disconnect(rec.destroyId);
        } catch (e) {}
        this._actorSignals.delete(role);
    }

    _bindActorSignals(role, actor, wrap) {
        this._unbindActorSignals(role);
        if (!actor || !wrap) return;

        const syncWrap = () => {
            try {
                if (!this._onOurPanel.has(role)) {
                    wrap.visible = false;
                    return;
                }
                wrap.visible = !!actor.visible;
            } catch (e) {}
        };

        let visId = 0, destroyId = 0;
        try {
            visId = actor.connect('notify::visible', syncWrap);
        } catch (e) {}
        try {
            destroyId = actor.connect('destroy', () => {
                try {
                    this._unbindActorSignals(role);
                    this._unwrap(role);
                    this._known.delete(role);
                    this._onOurPanel.delete(role);
                    this._persistRolesFile();
                } catch (e2) {}
            });
        } catch (e) {}
        this._actorSignals.set(role, {visId, destroyId});
        syncWrap();
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
            if (parent)
                parent.remove_child(actor);
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
        this._unbindActorSignals(role);
        const actor = this._known.get(role);
        const wrap = this._wrappers.get(role);
        if (!wrap) return;
        try {
            if (actor && actor.get_parent() === wrap)
                wrap.remove_child(actor);
        } catch (e) {}
        try {
            const parent = wrap.get_parent();
            if (parent)
                parent.remove_child(wrap);
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

    _persistRolesFile() {
        try {
            const roles = [...this._known.keys()]
                .filter(r => !isBlockedRole(r))
                .sort();
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
        return [...this._known.keys()].filter(
            r => !isBlockedRole(r) && !this._onOurPanel.has(r));
    }

    getMountedRoles() {
        return [...this._known.keys()].filter(r => !isBlockedRole(r));
    }
}
