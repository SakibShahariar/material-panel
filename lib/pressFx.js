import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import {iconPath, iconPathPrimary, iconPathOnAccent} from './iconTheme.js';
import {wirePointer} from './shellCompat.js';

/**
 * @param {string} key
 * @param {boolean} onAccent
 * @param {'primary'|'neutral'} resting
 */
export function giconForKey(key, onAccent, resting = 'primary') {
    try {
        let p;
        if (onAccent)
            p = iconPathOnAccent(key);
        else if (resting === 'neutral')
            p = iconPath(key);
        else
            p = iconPathPrimary(key);
        if (!Gio.File.new_for_path(p).query_exists(null))
            p = iconPath(key);
        if (Gio.File.new_for_path(p).query_exists(null))
            return Gio.FileIcon.new(Gio.File.new_for_path(p));
    } catch (e) {}
    return null;
}

/**
 * Unified press/hover for panel chips + QS controls.
 * Uses Clutter controllers on Shell 51+ via wirePointer; falls back to events.
 */
export function wireChipPress(actor, {
    getIcons = null,
    stickyUntilLeave = true,
    restingIcon = 'primary',
} = {}) {
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

        if (typeof getIcons !== 'function')
            return;

        let useOnAccent = state.pressed;
        let resting = 'primary';
        try {
            if (typeof restingIcon === 'function') {
                if (restingIcon())
                    useOnAccent = true;
                else
                    resting = 'neutral';
            } else if (restingIcon === 'neutral') {
                resting = 'neutral';
            }
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
            const g = giconForKey(entry.key, useOnAccent, resting);
            if (g) {
                try {
                    entry.icon.gicon = g;
                } catch (e) {}
            }
        }
    };

    state.applyIcons = apply;

    try {
        actor.reactive = true;
        actor.track_hover = true;
        actor.can_focus = true;
    } catch (e) {}

    const dispose = wirePointer(actor, {
        onEnter: () => {
            state.hovering = true;
            apply();
        },
        onLeave: () => {
            state.hovering = false;
            state.pressed = false;
            apply();
        },
        onPress: () => {
            state.pressed = true;
            apply();
        },
        onRelease: stickyUntilLeave
            ? null
            : () => {
                state.pressed = false;
                apply();
            },
    });

    // Keep dispose reachable if actor is destroyed
    try {
        actor.connect('destroy', () => {
            try { dispose(); } catch (e) {}
        });
    } catch (e) {}

    return state;
}

export function wireFileIconPress(actor, getIcons) {
    return wireChipPress(actor, {getIcons, stickyUntilLeave: true, restingIcon: 'primary'});
}

export function wirePressedClass(actor) {
    return wireChipPress(actor, {stickyUntilLeave: true});
}
