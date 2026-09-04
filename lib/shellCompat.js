/**
 * GNOME Shell 49–51 compatibility helpers.
 */
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

function shellMajor() {
    try {
        return parseInt(String(Config.PACKAGE_VERSION).split('.')[0], 10) || 0;
    } catch (e) {
        return 0;
    }
}

const SHELL_MAJOR = shellMajor();

export function prefersReducedMotion() {
    if (SHELL_MAJOR < 51)
        return false;
    try {
        const {reducedMotion} = St.Settings.get();
        if (St.ReducedMotion && reducedMotion === St.ReducedMotion.REDUCE)
            return true;
        if (typeof reducedMotion === 'number' && reducedMotion === 1)
            return true;
    } catch (e) {}
    return false;
}

export function menuOpen(menu, animate = true) {
    if (!menu)
        return;
    // Exclusive: close every other panel menu first
    try {
        globalThis._materialPanelCloseAllMenus?.(menu);
    } catch (e) {}

    const a = !!animate;
    if (SHELL_MAJOR >= 51) {
        try {
            menu.open({animate: a});
            return;
        } catch (e) {}
    }
    try {
        menu.open(a);
        return;
    } catch (e2) {}
    try {
        menu.open();
    } catch (e3) {
        logError(e3, 'material-panel: menuOpen');
    }
}

export function menuClose(menu, animate = false) {
    if (!menu)
        return;
    const a = !!animate;
    if (SHELL_MAJOR >= 51) {
        try {
            menu.close({animate: a});
            return;
        } catch (e) {}
    }
    try {
        menu.close(a);
        return;
    } catch (e2) {}
    try {
        menu.close();
    } catch (e3) {
        logError(e3, 'material-panel: menuClose');
    }
}

export function menuToggle(menu, animate = true) {
    if (!menu)
        return;
    let open = false;
    try {
        open = !!menu.isOpen;
    } catch (e) {
        try {
            open = !!menu.actor?.visible;
        } catch (e2) {}
    }
    if (open)
        menuClose(menu, false);
    else
        menuOpen(menu, animate);
}

export function timeoutOnce(ms, callback) {
    try {
        if (typeof GLib.timeout_add_once === 'function')
            return GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, ms, callback);
    } catch (e) {}
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        try { callback(); } catch (err) { logError(err, 'material-panel: timeoutOnce'); }
        return GLib.SOURCE_REMOVE;
    });
}

export function idleOnce(callback) {
    try {
        if (typeof GLib.idle_add_once === 'function')
            return GLib.idle_add_once(GLib.PRIORITY_DEFAULT, callback);
    } catch (e) {}
    return GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        try { callback(); } catch (err) { logError(err, 'material-panel: idleOnce'); }
        return GLib.SOURCE_REMOVE;
    });
}

/**
 * Legacy pointer signals only — ClickGesture was eating St.Button "clicked"
 * and preventing menus from toggling closed.
 */
export function wirePointer(actor, {
    onPress = null,
    onRelease = null,
    onEnter = null,
    onLeave = null,
} = {}) {
    const ids = [];
    try {
        actor.reactive = true;
        actor.track_hover = true;
    } catch (e) {}

    if (onEnter) {
        ids.push(actor.connect('enter-event', () => {
            onEnter();
            return Clutter.EVENT_PROPAGATE;
        }));
    }
    if (onLeave) {
        ids.push(actor.connect('leave-event', () => {
            onLeave();
            return Clutter.EVENT_PROPAGATE;
        }));
    }
    if (onPress) {
        ids.push(actor.connect('button-press-event', () => {
            onPress();
            return Clutter.EVENT_PROPAGATE;
        }));
    }
    if (onRelease) {
        ids.push(actor.connect('button-release-event', () => {
            onRelease();
            return Clutter.EVENT_PROPAGATE;
        }));
    }

    return () => {
        for (const id of ids) {
            try { actor.disconnect(id); } catch (e) {}
        }
    };
}
