/**
 * end-4 style active window chip: app icon + title.
 */
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export function buildFocusedWindow(_extensionPath, scale = 1.0) {
    const iconSize = Math.max(14, Math.round(16 * scale));
    const icon = new St.Icon({
        style_class: 'material-panel-focused-icon',
        icon_size: iconSize,
        icon_name: 'user-desktop-symbolic',
        y_align: Clutter.ActorAlign.CENTER,
    });
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
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-focused-btn',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: box,
    });
    try {
        // Cap width like end-4 ellipsized title
        button.style = `max-width: ${Math.round(180 * scale)}px;`;
    } catch (e) {}

    const tracker = Shell.WindowTracker.get_default();

    const refresh = () => {
        let win = null;
        try {
            win = global.display.focus_window;
        } catch (e) {}

        if (!win) {
            label.text = 'Desktop';
            icon.gicon = null;
            icon.icon_name = 'user-desktop-symbolic';
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
            if (app) {
                const gicon = app.get_icon();
                if (gicon) {
                    icon.icon_name = null;
                    icon.gicon = gicon;
                    return;
                }
            }
        } catch (e) {}
        icon.gicon = null;
        icon.icon_name = 'application-x-executable-symbolic';
    };

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
