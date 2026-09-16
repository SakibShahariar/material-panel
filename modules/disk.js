import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuToggle} from '../lib/shellCompat.js';
import {giconForKey, wireChipPress} from '../lib/pressFx.js';

function readDisk(mount = '/') {
    try {
        const [, out] = GLib.spawn_command_line_sync(`df -B1 ${mount}`);
        const text = new TextDecoder('utf-8').decode(out);
        const lines = text.trim().split('\n');
        if (lines.length < 2) return null;
        const parts = lines[1].trim().split(/\s+/);
        if (parts.length < 6) return null;
        return {
            size: parseInt(parts[1], 10),
            used: parseInt(parts[2], 10),
            avail: parseInt(parts[3], 10),
            pct: parseInt(String(parts[4]).replace('%', ''), 10),
            mount: parts[5],
            fs: parts[0],
        };
    } catch (e) {
        return null;
    }
}

function fmt(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    if (n < 1024 ** 3) return `${(n / (1024 ** 2)).toFixed(0)} MB`;
    return `${(n / (1024 ** 3)).toFixed(1)} GB`;
}

export function buildDisk(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        style_class: 'material-panel-disk-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        gicon: giconForKey('disk', false) || Gio.ThemedIcon.new('drive-harddisk-symbolic'),
    });
    const label = new St.Label({
        style_class: 'material-panel-disk-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '—',
    });
    const box = new St.BoxLayout({
        style: 'spacing: 4px;',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-disk-btn material-panel-chip',
        child: box,
        reactive: true,
        can_focus: true,
        track_hover: true,
    });
    try { wireChipPress(button); } catch (e) {}

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-disk-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({vertical: true, style: 'spacing: 6px; padding: 4px; min-width: 220px;'});
    const title = new St.Label({text: 'Storage', style_class: 'material-panel-cpu-popup-title'});
    const rootL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    const homeL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    body.add_child(title);
    body.add_child(rootL);
    body.add_child(homeL);
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    const refresh = () => {
        const root = readDisk('/');
        const home = readDisk(GLib.get_home_dir());
        if (root) {
            label.text = `${root.pct}%`;
            rootL.text = `/  ${fmt(root.used)} / ${fmt(root.size)}  (${root.pct}%)`;
            try {
                if (root.pct >= 90)
                    button.add_style_class_name('material-panel-chip-warn');
                else
                    button.remove_style_class_name('material-panel-chip-warn');
            } catch (e) {}
        } else {
            label.text = '—';
            rootL.text = '/  —';
        }
        if (home && home.mount !== '/')
            homeL.text = `Home  ${fmt(home.used)} / ${fmt(home.size)}  (${home.pct}%)`;
        else
            homeL.text = 'Home  same as /';
        return GLib.SOURCE_CONTINUE;
    };

    refresh();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, refresh);
    button.connect('clicked', () => {
        refresh();
        menuToggle(menu);
        return Clutter.EVENT_STOP;
    });
    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });
    return button;
}
