import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {menuClose} from './shellCompat.js';

const ALL_MENUS = new Set();
const MANAGERS = new WeakMap();

function _isOpen(menu) {
    try {
        if (menu.isOpen === true)
            return true;
        if (menu.isOpen === false)
            return false;
    } catch (e) {}
    try {
        return !!(menu.actor && menu.actor.visible);
    } catch (e) {
        return false;
    }
}

function _forceClose(menu) {
    if (!menu)
        return;
    try {
        menuClose(menu, false);
    } catch (e) {}
    try {
        if (menu.actor) {
            try { menu.actor.remove_all_transitions?.(); } catch (e) {}
            menu.actor.opacity = 255;
            menu.actor.scale_x = 1;
            menu.actor.scale_y = 1;
            menu.actor.translation_y = 0;
            if (menu.actor.visible)
                menu.actor.hide();
        }
    } catch (e) {}
    try {
        if (menu.isOpen)
            menu.close();
    } catch (e) {}
}

export function closeAllPanelMenus(except = null) {
    for (const m of ALL_MENUS) {
        if (m !== except && _isOpen(m))
            _forceClose(m);
    }
}

try {
    globalThis._materialPanelCloseAllMenus = closeAllPanelMenus;
} catch (e) {}

/** True if `actor` is `root` or a descendant of `root`. */
function _isDescendant(actor, root) {
    if (!actor || !root)
        return false;
    let a = actor;
    try {
        while (a) {
            if (a === root)
                return true;
            a = a.get_parent();
        }
    } catch (e) {}
    return false;
}

/**
 * Reliable "click is inside this menu" test.
 * BoxPointer / transformed size often fails for nested items — use pick + ancestry.
 */
function _isInsideMenu(menu, button, x, y) {
    if (!menu)
        return false;

    // Direct pick under pointer
    try {
        const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y)
            || global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
        if (picked) {
            if (_isDescendant(picked, button))
                return true;
            if (menu.actor && _isDescendant(picked, menu.actor))
                return true;
            if (menu.box && _isDescendant(picked, menu.box))
                return true;
            // PopupMenu source / bin variants
            try {
                if (menu.sourceActor && _isDescendant(picked, menu.sourceActor))
                    return true;
            } catch (e) {}
        }
    } catch (e) {}

    // Fallback bounding boxes (button + actor + box)
    const boxes = [button, menu.actor, menu.box].filter(Boolean);
    for (const actor of boxes) {
        try {
            if (!actor.visible)
                continue;
            const [ax, ay] = actor.get_transformed_position();
            let tw, th;
            try {
                [tw, th] = actor.get_transformed_size();
            } catch (e) {
                tw = actor.width;
                th = actor.height;
            }
            // Pad slightly for shadow / arrow
            if (x >= ax - 4 && x <= ax + tw + 4 && y >= ay - 4 && y <= ay + th + 4)
                return true;
        } catch (e) {}
    }
    return false;
}

/**
 * @param {object} menu
 * @param {Clutter.Actor} button
 */
export function attachPopupDismiss(menu, button, {
    closeOnOverview = true,
} = {}) {
    if (!menu || !button)
        return () => {};

    try {
        if (menu.actor && !menu.actor.get_parent()) {
            Main.uiGroup.add_child(menu.actor);
            menu.actor.hide();
        }
    } catch (e) {}

    try {
        let manager = MANAGERS.get(button);
        if (!manager) {
            manager = new PopupMenu.PopupMenuManager(button);
            MANAGERS.set(button, manager);
        }
        manager.addMenu(menu);
    } catch (e) {
        logError(e, 'material-panel: PopupMenuManager');
    }

    ALL_MENUS.add(menu);

    const stage = global.stage;

    // Only close on *outside* press. Never steal/stop events inside the menu.
    const clickId = stage.connect('captured-event', (_a, event) => {
        if (!_isOpen(menu))
            return Clutter.EVENT_PROPAGATE;
        const type = event.type();
        if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;
        let x, y;
        try {
            [x, y] = event.get_coords();
        } catch (e) {
            return Clutter.EVENT_PROPAGATE;
        }
        if (_isInsideMenu(menu, button, x, y))
            return Clutter.EVENT_PROPAGATE;
        _forceClose(menu);
        return Clutter.EVENT_PROPAGATE;
    });

    const keyId = stage.connect('captured-event', (_a, event) => {
        if (!_isOpen(menu))
            return Clutter.EVENT_PROPAGATE;
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            _forceClose(menu);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    const openId = menu.connect('open-state-changed', (_m, open) => {
        if (open) {
            closeAllPanelMenus(menu);
            try {
                menu.actor.opacity = 255;
                menu.actor.scale_x = 1;
                menu.actor.scale_y = 1;
                menu.actor.translation_y = 0;
            } catch (e) {}
        } else {
            try {
                try { menu.actor.remove_all_transitions?.(); } catch (e) {}
                menu.actor.opacity = 255;
                menu.actor.scale_x = 1;
                menu.actor.scale_y = 1;
                menu.actor.translation_y = 0;
                if (menu.actor.visible)
                    menu.actor.hide();
            } catch (e) {}
        }
    });

    let overviewId = 0;
    if (closeOnOverview) {
        try {
            overviewId = Main.overview.connect('showing', () => {
                if (_isOpen(menu))
                    _forceClose(menu);
            });
        } catch (e) {}
    }

    // Do NOT close on focus-window: clicking shell UI often doesn't change
    // focus_window, and when it does it races with in-menu button presses.
    // Outside clicks are handled by stage capture + PopupMenuManager.

    const dispose = () => {
        ALL_MENUS.delete(menu);
        try { stage.disconnect(clickId); } catch (e) {}
        try { stage.disconnect(keyId); } catch (e) {}
        try { menu.disconnect(openId); } catch (e) {}
        if (overviewId) {
            try { Main.overview.disconnect(overviewId); } catch (e) {}
        }
        try {
            MANAGERS.get(button)?.removeMenu?.(menu);
        } catch (e) {}
    };

    try { menu.actor.connect('destroy', dispose); } catch (e) {}
    try { button.connect('destroy', dispose); } catch (e) {}

    return dispose;
}

export function closeAfter(menu, fn) {
    return (...args) => {
        try {
            fn(...args);
        } finally {
            _forceClose(menu);
        }
    };
}
