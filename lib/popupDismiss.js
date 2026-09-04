import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Shared popup dismiss for panel menus (Wayland / GNOME Shell).
// Uses PopupMenuManager so clicks on app windows release the grab and close menus.

const GROUPS = new Map();
const MANAGERS = new WeakMap(); // button -> PopupMenuManager

function _groupSet(name) {
    if (!GROUPS.has(name))
        GROUPS.set(name, new Set());
    return GROUPS.get(name);
}

function _isOpen(menu) {
    try {
        if (menu.isOpen === true)
            return true;
        if (menu.isOpen === false)
            return false;
    } catch (e) {}
    try {
        return !!menu.actor?.visible;
    } catch (e) {
        return false;
    }
}

function _forceClose(menu) {
    try {
        menu.close(true);
    } catch (e) {
        try { menu.close(); } catch (e2) {}
    }
    try {
        if (menu.actor) {
            menu.actor.opacity = 255;
            menu.actor.scale_x = 1;
            menu.actor.scale_y = 1;
            menu.actor.translation_y = 0;
            if (menu.actor.visible)
                menu.actor.hide();
        }
    } catch (e) {}
}

function _closeOthers(menu, group) {
    const set = _groupSet(group);
    for (const other of set) {
        if (other !== menu && _isOpen(other))
            _forceClose(other);
    }
}

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
    return _coordsInActor(menu.actor, x, y) || _coordsInActor(button, x, y);
}

/** Android-like open/close motion on the menu actor */
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

function _animateClose(menu, done) {
    try {
        const a = menu.actor;
        a.set_pivot_point(0.5, 0);
        a.ease({
            opacity: 0,
            scale_x: 0.94,
            scale_y: 0.94,
            translation_y: -6,
            duration: 140,
            mode: Clutter.AnimationMode.EASE_IN_CUBIC,
            onComplete: () => {
                try {
                    a.hide();
                    a.opacity = 255;
                    a.scale_x = 1;
                    a.scale_y = 1;
                    a.translation_y = 0;
                } catch (e) {}
                done?.();
            },
        });
    } catch (e) {
        done?.();
    }
}

/**
 * Wire a panel PopupMenu for proper outside-click (including app windows) + motion.
 * Call AFTER creating the menu; this adds actor to uiGroup if needed and registers manager.
 *
 * @param {object} menu
 * @param {Clutter.Actor} button
 * @param {object} [opts]
 * @param {string} [opts.group='panel']
 * @param {boolean} [opts.closeOnOverview=true]
 * @param {boolean} [opts.animate=true]
 */
export function attachPopupDismiss(menu, button, {
    group = 'panel',
    closeOnOverview = true,
    animate = true,
} = {}) {
    if (!menu || !button)
        return () => {};

    // Ensure menu is on stage
    try {
        if (menu.actor && !menu.actor.get_parent()) {
            Main.uiGroup.add_child(menu.actor);
            menu.actor.hide();
        }
    } catch (e) {}

    // PopupMenuManager owns the pointer/keyboard grab — required so clicks on
    // Wayland app windows close the menu (stage events alone are not enough).
    try {
        let manager = MANAGERS.get(button);
        if (!manager) {
            manager = new PopupMenu.PopupMenuManager(button);
            MANAGERS.set(button, manager);
        }
        manager.addMenu(menu);
    } catch (e) {
        logError(e, 'material-panel: PopupMenuManager failed');
    }

    const set = _groupSet(group);
    set.add(menu);

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
        return Clutter.EVENT_PROPAGATE; // allow the click to reach the app window
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
            _closeOthers(menu, group);
            if (animate)
                _animateOpen(menu);
            else {
                try { menu.actor.opacity = 255; } catch (e) {}
            }
        } else if (animate) {
            // Menu already closing; soft reset transform
            try {
                menu.actor.scale_x = 1;
                menu.actor.scale_y = 1;
                menu.actor.translation_y = 0;
                menu.actor.opacity = 255;
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
            try {
                const fw = global.display.focus_window;
                if (!fw)
                    return;
            } catch (e) {}
            _forceClose(menu);
        });
    } catch (e) {}

    // Also when user activates a window via task switcher etc.
    let restackId = 0;
    try {
        restackId = global.display.connect('restacked', () => {
            // no-op placeholder; focus-window covers most cases
        });
    } catch (e) {}

    const dispose = () => {
        set.delete(menu);
        try { stage.disconnect(clickId); } catch (e) {}
        try { stage.disconnect(keyId); } catch (e) {}
        try { menu.disconnect(openId); } catch (e) {}
        if (overviewId) {
            try { Main.overview.disconnect(overviewId); } catch (e) {}
        }
        if (focusId) {
            try { global.display.disconnect(focusId); } catch (e) {}
        }
        if (restackId) {
            try { global.display.disconnect(restackId); } catch (e) {}
        }
        try {
            const manager = MANAGERS.get(button);
            manager?.removeMenu?.(menu);
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
