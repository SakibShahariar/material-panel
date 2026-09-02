import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const ROLE_BLOCKLIST = new Set([
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
        // Our builtin modules use material-panel-* but NOT foreign.
        // Tray icons get "material-panel-foreign-inner" after wrap — must NOT
        // treat those as builtins or _reparent becomes a permanent no-op
        // (hide-all on/off appears to do nothing).
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
        this._mounted = new Map();
        this._wrappers = new Map();
        this._adopted = new Set();
        this._zones = null;
        this._fallbackZone = null;
        this._hiddenBlocked = new Set();
        this._roleZones = new Map(); // role -> left|right|center|hidden (individual only)
        this._allHidden = false;     // master hide-all — independent of _roleZones
        // Roles we set actor.visible=false for (our hide). Never force-show
        // actors the owning extension hid itself.
        this._weHidActor = new Set();
        // role -> {visId, destroyId} for following extension hide/show
        this._actorSignals = new Map();
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
        this._allHidden = false;
        this._weHidActor.clear();
        for (const role of [...this._actorSignals.keys()])
            this._unbindActorSignals(role);
        this._actorSignals.clear();
    }

    /**
     * Master hide is opts.allHidden ONLY.
     * Individual hide is map[role] === 'hidden' ONLY.
     * Do NOT pass a bulk hiddenForeignRoles list — that re-hid everything after hide-all off.
     */
    setForeignPlacements(map, _legacyIgnored = [], opts = {}) {
        const prevAllHidden = this._allHidden;
        this._allHidden = !!opts.allHidden;
        this._roleZones.clear();

        let src = map && typeof map === 'object' ? {...map} : {};

        // Repair: every role stamped "hidden" (old hide-all) while master is off
        if (!this._allHidden) {
            const vals = Object.values(src);
            if (vals.length > 0 && vals.every(v => v === 'hidden')) {
                log('material-panel: tray repair — clearing all-hidden foreignRoleZones');
                src = {};
            }
        }

        for (const [role, zone] of Object.entries(src)) {
            if (['left', 'right', 'center', 'hidden'].includes(zone))
                this._roleZones.set(role, zone);
        }

        log(`material-panel: tray placements allHidden=${this._allHidden} (was ${prevAllHidden}) roles=${this._mounted.size} map=${this._roleZones.size}`);

        // Refresh actors from live statusArea (indicators may replace actors)
        for (const role of [...this._mounted.keys()]) {
            if (isBlockedRole(role)) continue;
            try {
                const live = Main.panel.statusArea?.[role];
                if (live && live !== this._mounted.get(role) && !isMaterialPanelActor(live))
                    this._mounted.set(role, live);
            } catch (e) {}
        }

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
        for (const role of [...this._mounted.keys()].sort()) {
            const actor = this._mounted.get(role);
            if (actor) this._reparent(role, actor);
        }
        // Stable LTR for right-side foreign: re-run right placements with addStart reverse
        const right = [...this._mounted.keys()].filter(r => this._placementFor(r) === 'right').sort();
        for (const role of right.slice().reverse()) {
            const actor = this._mounted.get(role);
            if (actor) this._reparent(role, actor);
        }
        this._persistRolesFile();
    }

    _placementFor(role) {
        if (this._allHidden)
            return 'hidden';

        // Tray prefs (foreignRoleZones) win over preset extension: claims.
        // Claims used to override Left/Right/Center/Hidden combos so they did nothing.
        if (this._roleZones.has(role))
            return this._roleZones.get(role);

        const claimed = this._claims.get(role);
        if (claimed?.name === 'left' || claimed?.name === 'right' || claimed?.name === 'center')
            return claimed.name;

        return 'right';
    }

    _onButtonAdded(role, actor) {
        if (!actor || !role) return;
        if (isMaterialPanelActor(actor)) {
            log(`material-panel: skip adopt builtin actor role="${role}"`);
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


    _unbindActorSignals(role) {
        const rec = this._actorSignals.get(role);
        const actor = this._mounted.get(role);
        if (!rec)
            return;
        try {
            if (actor && rec.visId)
                actor.disconnect(rec.visId);
        } catch (e) {}
        try {
            if (actor && rec.destroyId)
                actor.disconnect(rec.destroyId);
        } catch (e) {}
        this._actorSignals.delete(role);
    }

    /**
     * Keep chip background in sync with the inner indicator.
     * When the extension hides its icon, hide our wrapper too (no empty pill).
     */
    _bindActorSignals(role, actor, wrap) {
        this._unbindActorSignals(role);
        if (!actor || !wrap)
            return;

        const syncWrap = () => {
            try {
                if (this._placementFor(role) === 'hidden') {
                    wrap.visible = false;
                    return;
                }
                // Respect extension: empty chip if actor not shown
                const show = !!actor.visible;
                wrap.visible = show;
                if (!show)
                    log(`material-panel: "${role}" extension-hidden — chip collapsed`);
            } catch (e) {}
        };

        let visId = 0, destroyId = 0;
        try {
            visId = actor.connect('notify::visible', syncWrap);
        } catch (e) {}
        try {
            destroyId = actor.connect('destroy', () => {
                log(`material-panel: "${role}" destroyed by extension — remove chip`);
                try {
                    this._unbindActorSignals(role);
                    this._unwrap(role);
                    this._mounted.delete(role);
                    this._weHidActor.delete(role);
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
        this._unbindActorSignals(role);
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
        if (!actor || isMaterialPanelActor(actor))
            return;
        if (isBlockedRole(role)) {
            try {
                actor.visible = false;
                this._hiddenBlocked.add(role);
            } catch (e) {}
            return;
        }

        const placement = this._placementFor(role);
        log(`material-panel: reparent "${role}" → ${placement}`);

        if (placement === 'hidden') {
            try {
                let wrap = this._wrappers.get(role);
                if (!wrap)
                    wrap = this._ensureWrapper(role, actor);
                if (wrap) {
                    const zone = this._resolveZone('right') ?? this._fallbackZone;
                    if (zone && wrap.get_parent() !== zone.actor) {
                        const p = wrap.get_parent();
                        if (p) p.remove_child(wrap);
                        if (typeof zone.addStart === 'function')
                            zone.addStart(wrap);
                        else
                            zone.add(wrap);
                    }
                    wrap.visible = false;
                    this._bindActorSignals(role, actor, wrap);
                }
                try {
                    if (actor.visible) {
                        this._weHidActor.add(role);
                        actor.visible = false;
                    }
                } catch (e) {}
            } catch (e) {
                logError(e, `material-panel: hide "${role}"`);
            }
            return;
        }

        // SHOW — re-attach to zone; do NOT force actor.visible unless we hid it
        try {
            const wrap = this._ensureWrapper(role, actor);
            if (!wrap) return;
            const zone = this._resolveZone(placement);
            if (!zone) {
                log(`material-panel: no zone for "${role}" placement=${placement}`);
                return;
            }

            if (this._weHidActor.has(role)) {
                try { actor.visible = true; } catch (e) {}
                this._weHidActor.delete(role);
            }
            // else: leave actor.visible as the owning extension set it

            const parent = wrap.get_parent();
            if (parent)
                parent.remove_child(wrap);

            if (placement === 'right' && typeof zone.addStart === 'function')
                zone.addStart(wrap);
            else
                zone.add(wrap);

            this._bindActorSignals(role, actor, wrap);
            // syncWrap sets wrap.visible from actor.visible
            log(`material-panel: placed "${role}" in ${placement} actor.visible=${actor.visible}`);
        } catch (e) {
            logError(e, `material-panel: show "${role}"`);
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
