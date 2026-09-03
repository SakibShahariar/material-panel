import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import {iconPath, iconPathPrimary, iconPathOnAccent} from './iconTheme.js';

function giconFor(key, onAccent) {
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
 * On press, swap each tracked icon to the on-primary recolor; restore on release/leave.
 *
 * @param {Clutter.Actor} actor reactive actor
 * @param {() => Array<{icon: St.Icon, key: string}>} getIcons
 */
export function wireFileIconPress(actor, getIcons) {
    if (!actor || typeof getIcons !== 'function')
        return;

    let pressed = false;

    const apply = onAccent => {
        pressed = onAccent;
        try {
            if (onAccent)
                actor.add_style_class_name('pressed');
            else
                actor.remove_style_class_name('pressed');
        } catch (e) {}
        let list = [];
        try {
            list = getIcons() || [];
        } catch (e) {
            return;
        }
        for (const entry of list) {
            if (!entry?.icon || !entry?.key)
                continue;
            const g = giconFor(entry.key, onAccent);
            if (g) {
                try {
                    entry.icon.gicon = g;
                } catch (e) {}
            }
        }
    };

    actor.connect('button-press-event', () => {
        apply(true);
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('button-release-event', () => {
        apply(false);
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('leave-event', () => {
        if (pressed)
            apply(false);
        return Clutter.EVENT_PROPAGATE;
    });
}

/** Toggle `.pressed` only (for foreign / unknown icons). */
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
