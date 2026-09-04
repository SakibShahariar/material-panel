import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {menuClose} from './shellCompat.js';

/**
 * Popup dismiss without stage-level pointer capture.
 *
 * Capturing BUTTON_PRESS on the stage closed menus before clicks reached
 * inner St.Buttons (hit-test races with BoxPointer / capture phase).
 * Outside-click is handled by PopupMenuManager's grab, like stock Shell menus.
 */

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
        if (menu.actor?.visible)
            menu.actor.hide();
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

/**
 * @param {object} menu
 * @param {Clutter.Actor} button  source chip / opener
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
        if (globalThis._materialPanelLayoutStyle === 'end4')
            menu.actor.add_style_class_name('material-panel-layout-end4');
        else
            menu.actor.remove_style_class_name('material-panel-layout-end4');
    } catch (e) {}

    // Essential for outside-click + keyboard grab on Wayland
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

    // Esc only — no pointer capture
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
        if (open)
            closeAllPanelMenus(menu);
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

    const dispose = () => {
        ALL_MENUS.delete(menu);
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
