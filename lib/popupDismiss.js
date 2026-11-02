import Clutter from 'gi://Clutter';
import Atk from 'gi://Atk';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {menuClose} from './shellCompat.js';
import {getAdjacentFocusableIndex} from './popupFocus.js';
import {registerPanelMenuCloser} from './panelMenuCoordinator.js';
import {getLayoutStyle} from './layoutStyleState.js';

const ALL_MENUS = new Set();
const MANAGERS = new WeakMap();

function _isOpen(menu) {
    try {
        if (menu.isOpen === true) return true;
        if (menu.isOpen === false) return false;
    } catch (e) {}
    try { return !!(menu.actor && menu.actor.visible); } catch (e) { return false; }
}

function _forceClose(menu) {
    if (!menu) return;
    try { menuClose(menu, false); } catch (e) {}
    try { if (menu.actor?.visible) menu.actor.hide(); } catch (e) {}
}

function _collectFocusableActors(root) {
    const actors = [];
    const visit = actor => {
        if (!actor || actor.visible === false || actor.mapped === false) return;
        // Exclude controls that are technically focusable but currently have
        // no visible allocation (for example, collapsed or clipped rows).
        try {
            const box = actor.get_allocation_box?.();
            if (box && (box.x2 <= box.x1 || box.y2 <= box.y1))
                return;
        } catch (e) {}
        let canFocus = false;
        try { canFocus = actor.can_focus === true || actor.get_can_focus?.() === true; } catch (e) {}
        // Disabled controls may remain can_focus=true; never send keyboard focus to them.
        if (canFocus && actor.reactive !== false && actor.sensitive !== false)
            actors.push(actor);
        try { for (const child of actor.get_children?.() ?? []) visit(child); } catch (e) {}
    };
    visit(root);
    return actors;
}

function _isTextOrSliderFocus(actor) {
    let current = actor;
    while (current) {
        try {
            const role = current.get_accessible?.()?.get_role?.();
            if (role === Atk.Role.SLIDER || role === Atk.Role.TEXT_ENTRY ||
                role === Atk.Role.PASSWORD_TEXT) return true;
        } catch (e) {}
        try { if (current.clutter_text) return true; } catch (e) {}
        try { current = current.get_parent?.() ?? null; } catch (e) { current = null; }
    }
    return false;
}

function _focusAdjacentPopupActor(menu, stage, direction) {
    const actors = _collectFocusableActors(menu.actor);
    if (!actors.length) return false;
    let focused = null;
    try { focused = stage.get_key_focus(); } catch (e) {}
    let index = actors.indexOf(focused);
    let current = focused;
    while (index < 0 && current) {
        try { current = current.get_parent?.() ?? null; } catch (e) { current = null; }
        if (current) index = actors.indexOf(current);
    }
    const next = getAdjacentFocusableIndex(actors.length, index, direction);
    try { actors[next].grab_key_focus(); return true; } catch (e) { return false; }
}

export function clearPanelMenus() {
    ALL_MENUS.clear();
}

export function closeAllPanelMenus(except = null) {
    for (const m of ALL_MENUS) {
        if (m !== except && _isOpen(m)) _forceClose(m);
    }
}

// Register the module-owned callback without exposing it on the Shell global.
registerPanelMenuCloser(closeAllPanelMenus);

export function attachPopupDismiss(menu, button, {closeOnOverview = true} = {}) {
    if (!menu || !button) return () => {};
    try {
        if (menu.actor && !menu.actor.get_parent()) {
            Main.uiGroup.add_child(menu.actor);
            menu.actor.hide();
        }
    } catch (e) {}
    try { menu.actor.add_style_class_name('material-panel-keyboard-nav'); } catch (e) {}
    try {
        if (getLayoutStyle() === 'end4')
            menu.actor.add_style_class_name('material-panel-layout-end4');
        else
            menu.actor.remove_style_class_name('material-panel-layout-end4');
    } catch (e) {}
    try {
        let manager = MANAGERS.get(button);
        if (!manager) {
            manager = new PopupMenu.PopupMenuManager(button);
            MANAGERS.set(button, manager);
        }
        manager.addMenu(menu);
    } catch (e) { logError(e, 'material-panel: PopupMenuManager'); }

    ALL_MENUS.add(menu);
    const stage = global.stage;
    let restoreFocusId = 0;
    const keyId = stage.connect('captured-event', (_a, event) => {
        if (!_isOpen(menu) || event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        const key = event.get_key_symbol();
        if (key === Clutter.KEY_Escape) {
            _forceClose(menu);
            if (restoreFocusId) GLib.source_remove(restoreFocusId);
            restoreFocusId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                restoreFocusId = 0;
                try {
                    if (button.get_stage() === stage && button.visible && button.reactive)
                        button.grab_key_focus();
                } catch (e) {}
                return Clutter.SOURCE_REMOVE;
            });
            return Clutter.EVENT_STOP;
        }
        // Let focused St controls receive their native activation keys.
        // St.Button and toggle controls handle Return/Space themselves.
        if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter ||
            key === Clutter.KEY_space)
            return Clutter.EVENT_PROPAGATE;
        if (key === Clutter.KEY_Up || key === Clutter.KEY_Down ||
            key === Clutter.KEY_Left || key === Clutter.KEY_Right) {
            let focused = null;
            try { focused = stage.get_key_focus(); } catch (e) {}
            if (_isTextOrSliderFocus(focused)) return Clutter.EVENT_PROPAGATE;
            const direction = key === Clutter.KEY_Down || key === Clutter.KEY_Right ? 1 : -1;
            if (_focusAdjacentPopupActor(menu, stage, direction)) return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    const openId = menu.connect('open-state-changed', (_m, open) => {
        if (open) closeAllPanelMenus(menu);
    });
    let overviewId = 0;
    if (closeOnOverview) {
        try {
            overviewId = Main.overview.connect('showing', () => {
                if (_isOpen(menu)) _forceClose(menu);
            });
        } catch (e) {}
    }
    const dispose = () => {
        ALL_MENUS.delete(menu);
        if (restoreFocusId) {
            try { GLib.source_remove(restoreFocusId); } catch (e) {}
            restoreFocusId = 0;
        }
        try { stage.disconnect(keyId); } catch (e) {}
        try { menu.actor.remove_style_class_name('material-panel-keyboard-nav'); } catch (e) {}
        try { menu.disconnect(openId); } catch (e) {}
        if (overviewId) {
            try { Main.overview.disconnect(overviewId); } catch (e) {}
        }
        try { MANAGERS.get(button)?.removeMenu?.(menu); } catch (e) {}
    };
    try { menu.actor.connect('destroy', dispose); } catch (e) {}
    try { button.connect('destroy', dispose); } catch (e) {}
    return dispose;
}

export function closeAfter(menu, fn) {
    return (...args) => {
        try { fn(...args); } finally { _forceClose(menu); }
    };
}
