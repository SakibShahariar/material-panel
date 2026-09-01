import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Shared popup dismiss for panel menus (Wayland / GNOME Shell).
// - Esc / outside click close
// - One menu open per group
// - Close on overview
// - Avoid click-through reopen and isOpen/visibility desync

const GROUPS = new Map(); // groupName -> Set of menu

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
        menu.close();
    } catch (e) {}
    // Recover from desynced state (isOpen false but actor still shown)
    try {
        if (menu.actor) {
            menu.actor.opacity = 255;
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

/** True if stage coords fall inside actor's allocation. */
function _coordsInActor(actor, x, y) {
    if (!actor || !actor.visible)
        return false;
    try {
        const [ax, ay] = actor.get_transformed_position();
        const w = actor.get_transformed_size
            ? actor.get_transformed_size()[0]
            : actor.width;
        const h = actor.get_transformed_size
            ? actor.get_transformed_size()[1]
            : actor.height;
        // get_transformed_size returns [width, height]
        let tw = w, th = h;
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
    if (_coordsInActor(menu.actor, x, y))
        return true;
    if (_coordsInActor(button, x, y))
        return true;
    return false;
}

/**
 * @param {object} menu
 * @param {Clutter.Actor} button
 * @param {object} [opts]
 * @param {string} [opts.group='panel']
 * @param {boolean} [opts.closeOnOverview=true]
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

        // Click on source chip while open → close and STOP so the same
        // click does not toggle() open again on the button.
        if (_coordsInActor(button, x, y)) {
            _forceClose(menu);
            return Clutter.EVENT_STOP;
        }

        // Click inside menu → leave open
        if (_coordsInActor(menu.actor, x, y))
            return Clutter.EVENT_PROPAGATE;

        // Outside → close and STOP to avoid click-through reopening
        _forceClose(menu);
        return Clutter.EVENT_STOP;
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
            try {
                menu.actor.opacity = 255;
            } catch (e) {}
        } else {
            try {
                menu.actor.opacity = 255;
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
