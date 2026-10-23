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
import {calculateDiskUsage, sameFilesystem} from '../lib/diskUsage.js';

function readDiskAsync(mount, cancellable, callback) {
    const file = Gio.File.new_for_path(mount);
    try {
        file.query_filesystem_info_async(
            'filesystem::id,filesystem::size,filesystem::used,filesystem::free',
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (source, result) => {
                try {
                    const info = source.query_filesystem_info_finish(result);
                    let filesystemId = null;
                    try { filesystemId = info.get_attribute_string('filesystem::id') || null; } catch (e) {}
                    callback(calculateDiskUsage({
                        size: info.get_attribute_uint64('filesystem::size'),
                        used: info.get_attribute_uint64('filesystem::used'),
                        free: info.get_attribute_uint64('filesystem::free'),
                        filesystemId,
                        mount,
                    }));
                } catch (e) {
                    callback(null);
                }
            });
    } catch (e) {
        callback(null);
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

    let destroyed = false;
    let refreshInFlight = false;
    let sameFs = null;
    let lastRoot = null;
    let lastHome = null;
    let refreshCancellable = null;

    const updateLabels = () => {
        if (destroyed)
            return;
        const root = lastRoot;
        const home = lastHome;
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
        if (sameFs === true)
            homeL.text = 'Home  same as /';
        else if (home)
            homeL.text = `Home  ${fmt(home.used)} / ${fmt(home.size)}  (${home.pct}%)`;
        else
            homeL.text = 'Home  —';
    };

    const refresh = () => {
        if (destroyed || refreshInFlight)
            return GLib.SOURCE_CONTINUE;
        refreshInFlight = true;
        refreshCancellable = new Gio.Cancellable();
        let rootReady = false;
        let homeReady = sameFs === true;
        let rootResult = null;
        let homeResult = sameFs === true ? null : undefined;

        const finishIfReady = () => {
            if (!rootReady || !homeReady)
                return;
            if (destroyed) {
                refreshInFlight = false;
                refreshCancellable = null;
                return;
            }
            lastRoot = rootResult;
            if (sameFs === true) {
                lastHome = rootResult;
            } else {
                lastHome = homeResult;
                const shared = sameFilesystem(rootResult, homeResult);
                if (shared !== null)
                    sameFs = shared;
            }
            updateLabels();
            refreshInFlight = false;
            refreshCancellable = null;
        };

        readDiskAsync('/', refreshCancellable, root => {
            rootResult = root;
            rootReady = true;
            if (sameFs === true) {
                homeResult = root;
                homeReady = true;
            }
            finishIfReady();
        });

        if (sameFs !== true) {
            readDiskAsync(GLib.get_home_dir(), refreshCancellable, home => {
                homeResult = home;
                homeReady = true;
                finishIfReady();
            });
        }
        return GLib.SOURCE_CONTINUE;
    };

    refresh();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
        // Do not query filesystem metadata for a chip hidden with the panel.
        if (!button.mapped && !menu.isOpen)
            return GLib.SOURCE_CONTINUE;
        return refresh();
    });
    button.connect('clicked', () => {
        refresh();
        menuToggle(menu);
        return Clutter.EVENT_STOP;
    });
    button.connect('destroy', () => {
        destroyed = true;
        try { refreshCancellable?.cancel(); } catch (e) {}
        try { GLib.source_remove(id); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });
    return button;
}
