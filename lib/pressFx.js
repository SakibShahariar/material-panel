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
 * FileIcon SVGs are pre-colored — CSS `color` does nothing.
 * Tracks pressed state so other update() paths can call applyIcons().
 *
 * @returns {{ pressed: boolean, applyIcons: function }}
 */
export function wireFileIconPress(actor, getIcons) {
    const state = {pressed: false};

    const applyIcons = () => {
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
        try {
            if (state.pressed)
                actor.add_style_class_name('pressed');
            else
                actor.remove_style_class_name('pressed');
        } catch (e) {}
    };

    state.applyIcons = applyIcons;

    if (!actor || typeof getIcons !== 'function')
        return state;

    actor.connect('button-press-event', () => {
        state.pressed = true;
        applyIcons();
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('button-release-event', () => {
        state.pressed = false;
        applyIcons();
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('leave-event', () => {
        if (state.pressed) {
            state.pressed = false;
            applyIcons();
        }
        return Clutter.EVENT_PROPAGATE;
    });

    return state;
}

export function wirePressedClass(actor) {
    if (!actor)
        return;
    const on = () => {
        try { actor.add_style_class_name('pressed'); } catch (e) {}
        return Clutter.EVENT_PROPAGATE;
    };
    const off = () => {
        try { actor.remove_style_class_name('pressed'); } catch (e) {}
        return Clutter.EVENT_PROPAGATE;
    };
    actor.connect('button-press-event', on);
    actor.connect('button-release-event', off);
    actor.connect('leave-event', off);
}
