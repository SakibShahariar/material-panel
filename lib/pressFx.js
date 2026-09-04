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
 * Unified chip press visual:
 * - Primary bg + on-primary icons/text while interaction is active
 * - Stays until cursor LEAVES the actor (not only while button is down)
 *   so a quick click still shows feedback until the pointer moves away
 *
 * getIcons?: () => Array<{icon, key}>  for FileIcon swap
 * getLabels?: () => Array<St.Label>     optional
 */
export function wireChipPress(actor, {getIcons = null, stickyUntilLeave = true} = {}) {
    if (!actor)
        return {pressed: false, applyIcons: () => {}};

    const state = {pressed: false};

    const apply = () => {
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

    actor.reactive = true;
    try {
        actor.track_hover = true;
    } catch (e) {}

    actor.connect('button-press-event', () => {
        setPressed(true);
        return Clutter.EVENT_PROPAGATE;
    });

    if (stickyUntilLeave) {
        // Keep pressed until pointer leaves the chip
        actor.connect('button-release-event', () => {
            // stay pressed while cursor still over chip
            return Clutter.EVENT_PROPAGATE;
        });
        actor.connect('leave-event', () => {
            setPressed(false);
            return Clutter.EVENT_PROPAGATE;
        });
        actor.connect('enter-event', () => {
            // do not auto-press on enter
            return Clutter.EVENT_PROPAGATE;
        });
    } else {
        actor.connect('button-release-event', () => {
            setPressed(false);
            return Clutter.EVENT_PROPAGATE;
        });
        actor.connect('leave-event', () => {
            setPressed(false);
            return Clutter.EVENT_PROPAGATE;
        });
    }

    return state;
}

/** @deprecated use wireChipPress */
export function wireFileIconPress(actor, getIcons) {
    return wireChipPress(actor, {getIcons, stickyUntilLeave: true});
}

/** @deprecated use wireChipPress */
export function wirePressedClass(actor) {
    return wireChipPress(actor, {stickyUntilLeave: true});
}
