import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuToggle} from '../lib/shellCompat.js';
import {giconForKey, wireChipPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';

function readDisk(mount = '/') {
    // Prefer Gio filesystem info — no df subprocess on the compositor thread
    try {
        const file = Gio.File.new_for_path(mount);
        const info = file.query_filesystem_info(
            'filesystem::size,filesystem::used,filesystem::free', null);
        const size = Number(info.get_attribute_uint64('filesystem::size'));
        const used = Number(info.get_attribute_uint64('filesystem::used'));
        const free = Number(info.get_attribute_uint64('filesystem::free'));
        if (!Number.isFinite(size) || size <= 0)
            throw new Error('no size');
        const usedN = Number.isFinite(used) && used > 0
            ? used
            : Math.max(0, size - (Number.isFinite(free) ? free : 0));
        const avail = Number.isFinite(free) ? free : Math.max(0, size - usedN);
        const pct = Math.round((usedN / size) * 100);
        return {size, used: usedN, avail, pct, mount, fs: mount};
    } catch (e) {
        try {
            const [, out] = GLib.spawn_command_line_sync(`df -B1 ${GLib.shell_quote?.(mount) || mount}`);
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
        } catch (e2) {
            return null;
        }
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
    try { setChipA11y(button, 'Disk'); } catch (e) {}
    try { wireChipPress(button, {getIcons: () => [{icon, key: 'disk'}]}); } catch (e) {}

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-disk-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style: 'spacing: 6px; padding: 4px; min-width: 220px;'});
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
