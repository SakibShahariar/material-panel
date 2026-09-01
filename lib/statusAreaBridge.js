import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Intercepts Main.panel.addToStatusArea and reparents indicators into our zones.
// Foreign actors are wrapped in material-panel-chip material-panel-foreign so they
// pick up panel size (scale) and theme colors — without destroying the original.
export class StatusAreaBridge {
    constructor() {
        this._originalAddToStatusArea = null;
        this._claims = new Map();   // role -> Zone
        this._mounted = new Map();  // role -> foreign actor
        this._wrappers = new Map(); // role -> St.BoxLayout chip wrapper
        this._adopted = new Set();
        this._fallbackZone = null;
    }

    enable() {
        this._originalAddToStatusArea = Main.panel.addToStatusArea.bind(Main.panel);
        const self = this;

        Main.panel.addToStatusArea = function (role, indicator, position, box) {
            const button = self._originalAddToStatusArea(role, indicator, position, box);
            self._onButtonAdded(role, button ?? indicator);
            return button;
        };
    }

    disable() {
        for (const role of this._adopted) {
            const actor = this._mounted.get(role);
            if (!actor)
                continue;
            try {
                this._unwrap(role);
                const parent = actor.get_parent();
                if (parent)
                    parent.remove_child(actor);
                this._originalAddToStatusArea(role, actor);
            } catch (e) {
                logError(e, `material-panel: failed to restore adopted role "${role}" on disable`);
            }
        }

        // Unwrap any remaining (non-adopted intercepted) so we don't destroy foreign actors
        for (const role of [...this._mounted.keys()]) {
            try {
                this._unwrap(role);
            } catch (e) {}
        }

        if (this._originalAddToStatusArea)
            Main.panel.addToStatusArea = this._originalAddToStatusArea;
        this._originalAddToStatusArea = null;
        this._mounted.clear();
        this._wrappers.clear();
        this._adopted.clear();
        this._claims.clear();
        this._fallbackZone = null;
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

    _tryAdopt(role) {
        if (this._mounted.has(role))
            return;
        const actor = Main.panel.statusArea?.[role];
        if (actor) {
            this._adopted.add(role);
            this._onButtonAdded(role, actor);
        }
    }

    detachAll() {
        for (const [role, actor] of this._mounted.entries()) {
            const wrap = this._wrappers.get(role);
            const target = wrap ?? actor;
            try {
                const parent = target.get_parent();
                if (parent)
                    parent.remove_child(target);
            } catch (e) {}
        }
    }

    reattachAll() {
        for (const [role, actor] of this._mounted.entries())
            this._reparent(role, actor);
    }

    _onButtonAdded(role, actor) {
        if (!actor)
            return;
        this._mounted.set(role, actor);
        log(`material-panel: status area role added: "${role}"`);
        this._reparent(role, actor);
    }

    _ensureWrapper(role, actor) {
        let wrap = this._wrappers.get(role);
        if (wrap && wrap.get_parent() === null && [...wrap.get_children()].includes(actor))
            return wrap;

        if (wrap) {
            // Stale wrapper — rebuild
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
            // Soften stock panel-button chrome so our chip is the surface
            if (actor.add_style_class_name)
                actor.add_style_class_name('material-panel-foreign-inner');
            if (actor.set_style)
                actor.set_style('background-color: transparent; border: none; box-shadow: none;');
        } catch (e) {}
        wrap.add_child(actor);
        this._wrappers.set(role, wrap);
        return wrap;
    }

    _unwrap(role) {
        const actor = this._mounted.get(role);
        const wrap = this._wrappers.get(role);
        if (!wrap)
            return;
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

    _reparent(role, actor) {
        const zone = this._claims.get(role) ?? this._fallbackZone;
        if (!zone)
            return;
        try {
            const wrap = this._ensureWrapper(role, actor);
            const parent = wrap.get_parent();
            if (parent)
                parent.remove_child(wrap);
            zone.add(wrap);
        } catch (e) {
            logError(e, `material-panel: failed to reparent status area button "${role}"`);
        }
    }

    getUnclaimedRoles() {
        return [...this._mounted.keys()].filter(role => !this._claims.has(role));
    }

    /** All known roles (for prefs UI). */
    getMountedRoles() {
        return [...this._mounted.keys()];
    }
}
