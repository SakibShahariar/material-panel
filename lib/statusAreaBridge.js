import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Intercepts Main.panel.addToStatusArea (the public API other extensions use
// to add their own buttons) and reparents the resulting actor into one of
// our zones instead of leaving it in the stock (hidden) panel.
//
// IMPORTANT: actors created by other extensions must never be destroyed by
// us — only they know how to recreate them, and most only call
// addToStatusArea once, on their own enable(). So on every panel rebuild we
// detach (remove_child) rather than destroy, then reattach afterwards.
export class StatusAreaBridge {
    constructor() {
        this._originalAddToStatusArea = null;
        this._claims = new Map();   // uuid/role -> Zone
        this._mounted = new Map();  // uuid/role -> actor
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
        if (this._originalAddToStatusArea)
            Main.panel.addToStatusArea = this._originalAddToStatusArea;
        this._originalAddToStatusArea = null;
        this._mounted.clear();
        this._claims.clear();
        this._fallbackZone = null;
    }

    // Called by PanelBuilder while walking the config, once per render.
    clearClaims() {
        this._claims.clear();
    }

    setClaim(role, zone) {
        this._claims.set(role, zone);
    }

    setFallbackZone(zone) {
        this._fallbackZone = zone;
    }

    // Detach (not destroy) every bridged actor before the panel is torn down.
    detachAll() {
        for (const actor of this._mounted.values()) {
            const parent = actor.get_parent();
            if (parent)
                parent.remove_child(actor);
        }
    }

    // Re-parent every known bridged actor into its claimed zone (or the
    // fallback zone if unclaimed/not yet placed in any preset). Call after
    // rebuilding zones.
    reattachAll() {
        for (const [role, actor] of this._mounted.entries())
            this._reparent(role, actor);
    }

    _onButtonAdded(role, actor) {
        this._mounted.set(role, actor);
        this._reparent(role, actor);
    }

    _reparent(role, actor) {
        const zone = this._claims.get(role) ?? this._fallbackZone;
        if (!zone)
            return;
        try {
            const parent = actor.get_parent();
            if (parent)
                parent.remove_child(actor);
            zone.add(actor);
        } catch (e) {
            logError(e, `material-panel: failed to reparent status area button "${role}"`);
        }
    }

    // Roles currently mounted but not placed in any zone by the active
    // config - useful for a future prefs UI to list "unplaced" buttons.
    getUnclaimedRoles() {
        return [...this._mounted.keys()].filter(role => !this._claims.has(role));
    }
}
