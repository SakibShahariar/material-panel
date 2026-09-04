import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import {iconPath, iconPathPrimary, iconPathOnAccent} from './iconTheme.js';

/**
 * @param {string} key
 * @param {boolean} onAccent  - pressed / active on-primary icon
 * @param {'primary'|'neutral'} resting - when not onAccent
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
 * - .hover while pointer over
 * - .pressed sticky until leave → primary surface + on-primary icons
 *
 * @param {object} opts
 * @param {() => Array<{icon, key}>} [opts.getIcons]
 * @param {boolean} [opts.stickyUntilLeave=true]
 * @param {'primary'|'neutral'|function():boolean} [opts.restingIcon='primary']
 *        primary = default panel chips (primary icons)
 *        neutral = QS off tiles (surface-colored icons)
 *        function = return true to use on-accent at rest (e.g. tile is active)
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

    actor.connect('enter-event', () => {
        state.hovering = true;
        apply();
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('leave-event', () => {
        state.hovering = false;
        state.pressed = false;
        apply();
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('button-press-event', () => {
        state.pressed = true;
        apply();
        return Clutter.EVENT_PROPAGATE;
    });
    if (!stickyUntilLeave) {
        actor.connect('button-release-event', () => {
            state.pressed = false;
            apply();
            return Clutter.EVENT_PROPAGATE;
        });
    }

    return state;
}

export function wireFileIconPress(actor, getIcons) {
    return wireChipPress(actor, {getIcons, stickyUntilLeave: true, restingIcon: 'primary'});
}

export function wirePressedClass(actor) {
    return wireChipPress(actor, {stickyUntilLeave: true});
}
