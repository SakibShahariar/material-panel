import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// One open panel popup at a time (Wayland / GNOME Shell).
// Shared dismiss: outside click, Esc, exclusive group, optional overview close.

const GROUPS = new Map(); // groupName -> Set of menu

function _groupSet(name) {
    if (!GROUPS.has(name))
        GROUPS.set(name, new Set());
    return GROUPS.get(name);
}

function _isOpen(menu) {
    return menu.isOpen ?? menu.actor?.visible ?? false;
}

function _closeOthers(menu, group) {
    const set = _groupSet(group);
    for (const other of set) {
        if (other !== menu && _isOpen(other)) {
            try {
                other.close();
            } catch (e) {}
        }
    }
}

function _isInside(menu, button, target) {
    if (!target)
        return false;
    let cur = target;
    while (cur) {
        if (cur === menu.actor || cur === button)
            return true;
        cur = cur.get_parent();
    }
    try {
        if (menu.actor?.contains?.(target) || button?.contains?.(target))
            return true;
    } catch (e) {}
    return false;
}

/**
 * Attach dismiss + exclusive-open behavior to a PopupMenu.
 *
 * @param {object} menu - PopupMenu.PopupMenu instance
 * @param {Clutter.Actor} button - Anchor chip/button
 * @param {object} [opts]
 * @param {string} [opts.group='panel'] - Exclusive group name
 * @param {boolean} [opts.closeOnOverview=true] - Close when Activities overview opens
 * @returns {function} dispose() — call on destroy if needed (also auto-cleans)
 */
export function attachPopupDismiss(menu, button, opts = {}) {
    const group = opts.group ?? 'panel';
    const closeOnOverview = opts.closeOnOverview !== false;
    const stage = global.stage;
    const set = _groupSet(group);
    set.add(menu);

    const clickId = stage.connect('captured-event', (_a, event) => {
        if (!_isOpen(menu))
            return Clutter.EVENT_PROPAGATE;
        if (event.type() !== Clutter.EventType.BUTTON_PRESS)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const target = stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        if (_isInside(menu, button, target))
            return Clutter.EVENT_PROPAGATE;
        try {
            menu.close();
        } catch (e) {}
        return Clutter.EVENT_PROPAGATE;
    });

    const keyId = stage.connect('captured-event', (_a, event) => {
        if (!_isOpen(menu))
            return Clutter.EVENT_PROPAGATE;
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            try {
                menu.close();
            } catch (e) {}
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    const openId = menu.connect('open-state-changed', (_m, open) => {
        if (open)
            _closeOthers(menu, group);
    });

    let overviewId = 0;
    if (closeOnOverview) {
        try {
            overviewId = Main.overview.connect('showing', () => {
                if (_isOpen(menu)) {
                    try {
                        menu.close();
                    } catch (e) {}
                }
            });
        } catch (e) {}
    }

    const dispose = () => {
        set.delete(menu);
        try { stage.disconnect(clickId); } catch (e) {}
        try { stage.disconnect(keyId); } catch (e) {}
        try { menu.disconnect(openId); } catch (e) {}
        if (overviewId) {
            try { Main.overview.disconnect(overviewId); } catch (e) {}
            overviewId = 0;
        }
    };

    menu.actor.connect('destroy', dispose);
    button.connect('destroy', dispose);

    return dispose;
}

/** Close menu after a one-shot action (Settings, power, etc.). */
export function closeAfter(menu, fn) {
    return (...args) => {
        try {
            fn(...args);
        } finally {
            try {
                menu.close();
            } catch (e) {}
        }
    };
}
