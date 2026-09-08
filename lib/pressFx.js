import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import {iconPath, iconPathPrimary, iconPathOnAccent} from './iconTheme.js';
import {setMaterialSymbolColor, setMaterialSymbolKey} from './materialSymbol.js';
import {wirePointer} from './shellCompat.js';

/** Solid fix: St symbolic icons default to white unless color + -st-icon-style set. */
export function primaryColor() {
    return globalThis._materialPanelPrimary ?? '#89b4fa';
}
export function onPrimaryColor() {
    return globalThis._materialPanelOnPrimary ?? '#1e1e2e';
}

export function tintSymbolic(icon, color) {
    if (!icon)
        return;
    try {
        icon.style = `-st-icon-style: symbolic; color: ${color};`;
    } catch (e) {}
    try {
        // St.Icon also honors this when set as property on some Shell versions
        if ('icon_name' in icon && icon.icon_name && !String(icon.icon_name).includes('-symbolic')) {
            // leave name; still force symbolic style for tinting
        }
    } catch (e) {}
}

/** Tint every St.Icon under actor (symbolic chrome). FileIcons ignore color — use gicon swap. */
export function tintSymbolicTree(root, color) {
    if (!root)
        return;
    const visit = actor => {
        if (!actor)
            return;
        try {
            // Duck-type St.Icon: has icon_name or gicon and style_class often includes Icon
            if (actor.icon_name != null || (actor.gicon != null && actor.icon_size != null)) {
                // Only force CSS color when using icon_name (themed/symbolic). FileIcon keeps gicon.
                if (actor.icon_name)
                    tintSymbolic(actor, color);
            }
        } catch (e) {}
        let n = 0;
        try { n = actor.get_n_children?.() ?? 0; } catch (e) { n = 0; }
        for (let i = 0; i < n; i++) {
            try { visit(actor.get_child_at_index(i)); } catch (e) {}
        }
    };
    visit(root);
}


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

        // Solid fix: symbolic icons under this control always follow primary / on_primary
        try {
            tintSymbolicTree(actor, state.pressed ? onPrimaryColor() : primaryColor());
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
            if (!entry?.key)
                continue;
            // Material Symbols Rounded label (end-4 style)
            if (entry.symbol) {
                try {
                    setMaterialSymbolKey(entry.symbol, entry.key);
                    const col = useOnAccent
                        ? (globalThis._materialPanelOnPrimary ?? '#1e1e2e')
                        : (globalThis._materialPanelPrimary ?? '#89b4fa');
                    setMaterialSymbolColor(entry.symbol, col, useOnAccent ? 1 : 1);
                } catch (e) {}
                continue;
            }
            if (!entry?.icon)
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
