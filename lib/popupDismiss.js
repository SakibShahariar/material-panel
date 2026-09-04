import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {menuClose, prefersReducedMotion} from './shellCompat.js';

// All panel menus (any group) — for exclusive open + force-close
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
        // Belt-and-suspenders if isOpen desyncs
        if (menu.actor) {
            menu.actor.remove_all_transitions?.();
            menu.actor.opacity = 255;
            menu.actor.scale_x = 1;
            menu.actor.scale_y = 1;
            menu.actor.translation_y = 0;
            if (menu.actor.visible)
                menu.actor.hide();
        }
    } catch (e) {}
    // Last resort: set private flag if still marked open
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

function _coordsInActor(actor, x, y) {
    if (!actor || !actor.visible)
        return false;
    try {
        const [ax, ay] = actor.get_transformed_position();
        let tw, th;
        try {
            [tw, th] = actor.get_transformed_size();
        } catch (e) {
            tw = actor.width;
            th = actor.height;
        }
        return x >= ax && x <= ax + tw && y >= ay && y <= ay + th;
    } catch (e) {
        return false;
    }
}

function _isInsideCoords(menu, button, x, y) {
    return _coordsInActor(menu?.actor, x, y) || _coordsInActor(button, x, y);
}

function _animateOpen(menu) {
    try {
        const a = menu.actor;
        a.set_pivot_point(0.5, 0);
        a.opacity = 0;
        a.scale_x = 0.92;
        a.scale_y = 0.92;
        a.translation_y = -10;
        a.ease({
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            translation_y: 0,
            duration: 220,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    } catch (e) {
        try { menu.actor.opacity = 255; } catch (e2) {}
    }
}

/**
 * @param {object} menu
 * @param {Clutter.Actor} button
 * @param {object} [opts]
 */
export function attachPopupDismiss(menu, button, {
    closeOnOverview = true,
    animate = true,
} = {}) {
    if (!menu || !button)
        return () => {};

    try {
        if (menu.actor && !menu.actor.get_parent()) {
            Main.uiGroup.add_child(menu.actor);
            menu.actor.hide();
        }
    } catch (e) {}

    // Shared manager on Main.layoutManager uiGroup owner helps grab on Wayland
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
        if (_isInsideCoords(menu, button, x, y))
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
            if (animate && !prefersReducedMotion())
                _animateOpen(menu);
            else {
                try {
                    menu.actor.opacity = 255;
                    menu.actor.scale_x = 1;
                    menu.actor.scale_y = 1;
                    menu.actor.translation_y = 0;
                } catch (e) {}
            }
        } else {
            try {
                menu.actor.remove_all_transitions?.();
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

    let focusId = 0;
    try {
        focusId = global.display.connect('notify::focus-window', () => {
            if (!_isOpen(menu))
                return;
            let fw = null;
            try {
                fw = global.display.focus_window;
            } catch (e) {}
            if (!fw)
                return;
            _forceClose(menu);
        });
    } catch (e) {}

    const dispose = () => {
        ALL_MENUS.delete(menu);
        try { stage.disconnect(clickId); } catch (e) {}
        try { stage.disconnect(keyId); } catch (e) {}
        try { menu.disconnect(openId); } catch (e) {}
        if (overviewId) {
            try { Main.overview.disconnect(overviewId); } catch (e) {}
        }
        if (focusId) {
            try { global.display.disconnect(focusId); } catch (e) {}
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
