/**
 * end-4 style active window chip: app icon + title.
 * Desktop state uses themed primary icon; app icons keep full-color from
 * the icon theme but sit on an opaque chip so contrast stays readable.
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {wireChipPress} from '../lib/pressFx.js';
import {iconPathPrimary, iconPath} from '../lib/iconTheme.js';

function loadThemedGicon(key) {
    try {
        let p = iconPathPrimary(key);
        if (!Gio.File.new_for_path(p).query_exists(null))
            p = iconPath(key);
        if (Gio.File.new_for_path(p).query_exists(null))
            return Gio.FileIcon.new(Gio.File.new_for_path(p));
    } catch (e) {}
    return null;
}

export function buildFocusedWindow(_extensionPath, scale = 1.0) {
    const iconSize = Math.max(14, Math.round(16 * scale));

    // Icon sits in a small rounded well so full-color app SVGs don't clash
    const iconWell = new St.Bin({
        style_class: 'material-panel-focused-icon-well',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        iconWell.style =
            `width: ${iconSize + 6}px; height: ${iconSize + 6}px; border-radius: 999px;`;
    } catch (e) {}

    const icon = new St.Icon({
        style_class: 'material-panel-focused-icon',
        icon_size: iconSize,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
    });
    iconWell.set_child(icon);

    const label = new St.Label({
        style_class: 'material-panel-focused-label',
        text: 'Desktop',
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    } catch (e) {}

    const box = new St.BoxLayout({
        style_class: 'material-panel-focused material-panel-chip',
        vertical: false,
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(iconWell);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-focused-btn',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: box,
    });
    try {
        button.style = `max-width: ${Math.round(200 * scale)}px;`;
    } catch (e) {}
    try {
        wireChipPress(button, {stickyUntilLeave: true});
    } catch (e) {}

    const tracker = Shell.WindowTracker.get_default();

    const setDesktopIcon = () => {
        // Prefer our recolored computer/desktop asset (primary)
        const g =
            loadThemedGicon('computer')
            || loadThemedGicon('apps');
        if (g) {
            icon.icon_name = null;
            icon.gicon = g;
        } else {
            icon.gicon = null;
            icon.icon_name = 'user-desktop-symbolic';
        }
        try {
            icon.remove_style_class_name('material-panel-focused-icon-app');
            icon.add_style_class_name('material-panel-focused-icon-desktop');
        } catch (e) {}
    };

    const setAppIcon = app => {
        try {
            // create_icon_texture often looks better than raw gicon for SVG themes
            if (typeof app.create_icon_texture === 'function') {
                const tex = app.create_icon_texture(iconSize);
                if (tex) {
                    // St.Icon can't take texture directly; use gicon still
                }
            }
            const gicon = app.get_icon();
            if (gicon) {
                icon.icon_name = null;
                icon.gicon = gicon;
                try {
                    icon.remove_style_class_name('material-panel-focused-icon-desktop');
                    icon.add_style_class_name('material-panel-focused-icon-app');
                } catch (e) {}
                return true;
            }
        } catch (e) {}
        return false;
    };

    const refresh = () => {
        let win = null;
        try {
            win = global.display.focus_window;
        } catch (e) {}

        if (!win) {
            label.text = 'Desktop';
            setDesktopIcon();
            return;
        }

        let title = '';
        try {
            title = win.get_title() || '';
        } catch (e) {
            title = '';
        }
        label.text = title.trim() || 'Desktop';

        try {
            const app = tracker.get_window_app(win);
            if (app && setAppIcon(app))
                return;
        } catch (e) {}

        icon.gicon = null;
        icon.icon_name = 'application-x-executable-symbolic';
        try {
            icon.remove_style_class_name('material-panel-focused-icon-desktop');
            icon.add_style_class_name('material-panel-focused-icon-app');
        } catch (e) {}
    };

    setDesktopIcon();
    refresh();

    const ids = [];
    try {
        ids.push(['display', global.display.connect('notify::focus-window', refresh)]);
    } catch (e) {}
    try {
        ids.push(['wm', global.window_manager.connect('switch-workspace', refresh)]);
    } catch (e) {}

    const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
        refresh();
        return GLib.SOURCE_CONTINUE;
    });

    button.connect('destroy', () => {
        for (const [kind, id] of ids) {
            try {
                if (kind === 'display')
                    global.display.disconnect(id);
                else
                    global.window_manager.disconnect(id);
            } catch (e) {}
        }
        try {
            GLib.source_remove(timer);
        } catch (e) {}
    });

    button.connect('clicked', () => {
        try {
            Main.overview.toggle();
        } catch (e) {}
    });

    return button;
}
