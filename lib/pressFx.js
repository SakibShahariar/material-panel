import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import {iconPath, iconPathPrimary, iconPathOnAccent} from './iconTheme.js';

export function giconForKey(key, onAccent) {
    try {
        let p = onAccent ? iconPathOnAccent(key) : iconPathPrimary(key);
        if (!Gio.File.new_for_path(p).query_exists(null))
            p = iconPath(key);
        if (Gio.File.new_for_path(p).query_exists(null))
            return Gio.FileIcon.new(Gio.File.new_for_path(p));
    } catch (e) {}
    return null;
}

/**
 * Unified interaction for panel chips + QS controls.
 * - `.hover` while pointer is over
 * - `.pressed` after click until leave (sticky) — primary surface
 * FileIcon keys swap to on-accent while pressed.
 */
export function wireChipPress(actor, {getIcons = null, stickyUntilLeave = true} = {}) {
    if (!actor)
        return {pressed: false, applyIcons: () => {}};

    const state = {pressed: false, hovering: false};

    const apply = () => {
        try {
            if (state.hovering)
                actor.add_style_class_name('hover');
            else
                actor.remove_style_class_name('hover');
        } catch (e) {}
        try {
            if (state.pressed)
                actor.add_style_class_name('pressed');
            else
                actor.remove_style_class_name('pressed');
        } catch (e) {}

        if (typeof getIcons === 'function') {
            let list = [];
            try {
                list = getIcons() || [];
            } catch (e) {
                return;
            }
            for (const entry of list) {
                if (!entry?.icon || !entry?.key)
                    continue;
                const g = giconForKey(entry.key, state.pressed);
                if (g) {
                    try {
                        entry.icon.gicon = g;
                    } catch (e) {}
                }
            }
        }
    };

    state.applyIcons = apply;

    const setPressed = v => {
        state.pressed = !!v;
        apply();
    };

    try {
        actor.reactive = true;
        actor.track_hover = true;
        actor.can_focus = true;
    } catch (e) {}

    actor.connect('enter-event', () => {
        state.hovering = true;
        apply();
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('leave-event', () => {
        state.hovering = false;
        setPressed(false);
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('button-press-event', () => {
        setPressed(true);
        return Clutter.EVENT_PROPAGATE;
    });
    if (!stickyUntilLeave) {
        actor.connect('button-release-event', () => {
            setPressed(false);
            return Clutter.EVENT_PROPAGATE;
        });
    }

    return state;
}

export function wireFileIconPress(actor, getIcons) {
    return wireChipPress(actor, {getIcons, stickyUntilLeave: true});
}

export function wirePressedClass(actor) {
    return wireChipPress(actor, {stickyUntilLeave: true});
}
