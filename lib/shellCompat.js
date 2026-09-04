/**
 * GNOME Shell 49–51 compatibility helpers.
 * Prefer modern APIs; fall back when running on older shells.
 */
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

/** @returns {boolean} true when user prefers reduced motion (Shell 51+) */
export function prefersReducedMotion() {
    try {
        const settings = St.Settings.get();
        if (settings && settings.reduced_motion !== undefined) {
            // St.ReducedMotion.REDUCE === 1 typically
            const v = settings.reduced_motion;
            if (typeof v === 'number')
                return v === 1 || v === St.ReducedMotion?.REDUCE;
            return !!v;
        }
    } catch (e) {}
    try {
        const {reducedMotion} = St.Settings.get();
        return reducedMotion === St.ReducedMotion.REDUCE;
    } catch (e) {}
    return false;
}

/**
 * PopupMenu open/close: Shell 51 uses params object {animate, fadeOnly}.
 * Older shells accepted a boolean animation flag.
 */
export function menuOpen(menu, animate = true) {
    if (!menu)
        return;
    try {
        menu.open({animate: !!animate});
        return;
    } catch (e) {}
    try {
        menu.open(!!animate);
        return;
    } catch (e2) {}
    try {
        menu.open();
    } catch (e3) {
        logError(e3, 'material-panel: menuOpen');
    }
}

export function menuClose(menu, animate = true) {
    if (!menu)
        return;
    try {
        menu.close({animate: !!animate});
        return;
    } catch (e) {}
    try {
        menu.close(!!animate);
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
    } catch (e) {}
    if (open)
        menuClose(menu, animate);
    else
        menuOpen(menu, animate);
}

/** One-shot timeout; uses GLib.timeout_add_once when available (Shell 50+). */
export function timeoutOnce(ms, callback) {
    try {
        if (typeof GLib.timeout_add_once === 'function')
            return GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, ms, callback);
    } catch (e) {}
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        try {
            callback();
        } catch (e) {
            logError(e, 'material-panel: timeoutOnce');
        }
        return GLib.SOURCE_REMOVE;
    });
}

export function idleOnce(callback) {
    try {
        if (typeof GLib.idle_add_once === 'function')
            return GLib.idle_add_once(GLib.PRIORITY_DEFAULT, callback);
    } catch (e) {}
    return GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        try {
            callback();
        } catch (e) {
            logError(e, 'material-panel: idleOnce');
        }
        return GLib.SOURCE_REMOVE;
    });
}

/**
 * Wire press / hover using Clutter controllers when available (Shell 49/51+),
 * otherwise fall back to legacy actor event signals.
 *
 * @param {Clutter.Actor} actor
 * @param {object} handlers
 * @param {function():void} [handlers.onPress]
 * @param {function():void} [handlers.onRelease]
 * @param {function():void} [handlers.onEnter]
 * @param {function():void} [handlers.onLeave]
 * @returns {function():void} dispose
 */
export function wirePointer(actor, {
    onPress = null,
    onRelease = null,
    onEnter = null,
    onLeave = null,
} = {}) {
    const disposers = [];

    // Hover via MotionController if present
    try {
        if (onEnter || onLeave) {
            if (Clutter.MotionController) {
                const motion = new Clutter.MotionController();
                if (onEnter) {
                    motion.connect('enter', () => {
                        onEnter();
                        return Clutter.EVENT_PROPAGATE;
                    });
                }
                if (onLeave) {
                    motion.connect('leave', () => {
                        onLeave();
                        return Clutter.EVENT_PROPAGATE;
                    });
                }
                actor.add_action(motion);
                disposers.push(() => {
                    try { actor.remove_action(motion); } catch (e) {}
                });
            } else {
                if (onEnter) {
                    const id = actor.connect('enter-event', () => {
                        onEnter();
                        return Clutter.EVENT_PROPAGATE;
                    });
                    disposers.push(() => {
                        try { actor.disconnect(id); } catch (e) {}
                    });
                }
                if (onLeave) {
                    const id = actor.connect('leave-event', () => {
                        onLeave();
                        return Clutter.EVENT_PROPAGATE;
                    });
                    disposers.push(() => {
                        try { actor.disconnect(id); } catch (e) {}
                    });
                }
            }
        }
    } catch (e) {
        logError(e, 'material-panel: wirePointer hover');
    }

    // Click / press via ClickGesture if present
    try {
        if (onPress || onRelease) {
            if (Clutter.ClickGesture) {
                const click = new Clutter.ClickGesture();
                // recognize-press / recognize may vary by version — try several
                const tryConnect = (sig, fn) => {
                    try {
                        click.connect(sig, () => {
                            fn?.();
                            return Clutter.EVENT_PROPAGATE;
                        });
                        return true;
                    } catch (e) {
                        return false;
                    }
                };
                if (onPress) {
                    if (!tryConnect('recognize-press', onPress))
                        tryConnect('pressed', onPress);
                }
                if (onRelease) {
                    if (!tryConnect('recognize', onRelease))
                        tryConnect('released', onRelease);
                }
                // Fallback: on recognize treat as full click
                if (onPress && onRelease) {
                    tryConnect('recognize', () => {
                        onPress();
                        onRelease();
                    });
                }
                actor.add_action(click);
                disposers.push(() => {
                    try { actor.remove_action(click); } catch (e) {}
                });
            } else {
                if (onPress) {
                    const id = actor.connect('button-press-event', () => {
                        onPress();
                        return Clutter.EVENT_PROPAGATE;
                    });
                    disposers.push(() => {
                        try { actor.disconnect(id); } catch (e) {}
                    });
                }
                if (onRelease) {
                    const id = actor.connect('button-release-event', () => {
                        onRelease();
                        return Clutter.EVENT_PROPAGATE;
                    });
                    disposers.push(() => {
                        try { actor.disconnect(id); } catch (e) {}
                    });
                }
            }
        }
    } catch (e) {
        logError(e, 'material-panel: wirePointer press');
    }

    return () => {
        for (const d of disposers) {
            try { d(); } catch (e) {}
        }
    };
}
