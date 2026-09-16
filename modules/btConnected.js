/**
 * Connected headphones chip + focused popup (not full BT device browser).
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {wireChipPress, giconForKey} from '../lib/pressFx.js';
import {attachPopupDismiss, closeAfter} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';

const BLUEZ = 'org.bluez';
const DEVICE_IFACE = 'org.bluez.Device1';

function isAudioHeadset(props) {
    try {
        const icon = String(props['Icon']?.deep_unpack?.() ?? '').toLowerCase();
        if (icon.includes('headset') || icon.includes('headphone') || icon.includes('audio'))
            return true;
    } catch (e) {}
    try {
        const name = String(props['Alias']?.deep_unpack?.() ?? props['Name']?.deep_unpack?.() ?? '').toLowerCase();
        if (/headphone|headset|buds|airpod|earbud|soundcore|sony|bose|jbl|nothing|cmf|wh-|wf-/.test(name))
            return true;
    } catch (e) {}
    try {
        const cls = props['Class']?.deep_unpack?.() ?? 0;
        if ((cls & 0x1f00) === 0x0400)
            return true;
    } catch (e) {}
    return false;
}

function batteryPct(props, ifaces) {
    try {
        const p = props['Percentage']?.deep_unpack?.();
        if (p != null && Number.isFinite(Number(p)))
            return Math.round(Number(p));
    } catch (e) {}
    try {
        for (const [iface, ip] of Object.entries(ifaces || {})) {
            if (String(iface).includes('Battery') && ip?.Percentage) {
                const p = ip.Percentage.deep_unpack();
                if (p != null && Number.isFinite(Number(p)))
                    return Math.round(Number(p));
            }
        }
    } catch (e) {}
    return null;
}

function deviceName(props) {
    try {
        return String(props['Alias']?.deep_unpack?.() ?? props['Name']?.deep_unpack?.() ?? 'Headphones');
    } catch (e) {
        return 'Headphones';
    }
}

export function buildBtConnected(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        style_class: 'material-panel-bt-connected-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: giconForKey('headphones', false) || Gio.ThemedIcon.new('audio-headphones-symbolic'),
    });
    const label = new St.Label({
        text: '',
        style_class: 'material-panel-bt-connected-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const box = new St.BoxLayout({
        vertical: false,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'material-panel-bt-connected',
        style: 'spacing: 6px;',
    });
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-bt-connected-btn material-panel-chip',
        child: box,
        reactive: true,
        can_focus: true,
        track_hover: true,
        visible: false,
    });
    wireChipPress(button);

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-headphones-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-headphones-popup-body',
        style: 'spacing: 10px; padding: 4px 2px; min-width: 260px;',
    });

    const title = new St.Label({
        text: 'Headphones',
        style_class: 'material-panel-headphones-title',
    });
    body.add_child(title);

    const listBox = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-headphones-list',
        style: 'spacing: 8px;',
    });
    body.add_child(listBox);

    const emptyLbl = new St.Label({
        text: 'No audio headset connected',
        style_class: 'material-panel-headphones-empty',
    });
    body.add_child(emptyLbl);

    // Use PopupMenu item for settings so it matches other menus
    const settingsItem = new PopupMenu.PopupMenuItem('Sound settings');
    settingsItem.connect('activate', () => {
        try {
            GLib.spawn_command_line_async('gnome-control-center sound');
        } catch (e) {
            try { GLib.spawn_command_line_async('pavucontrol'); } catch (e2) {}
        }
        closeAfter(menu);
    });

    const bodyItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    bodyItem.add_child(body);
    menu.addMenuItem(bodyItem);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    menu.addMenuItem(settingsItem);

    const rebuildList = devices => {
        listBox.destroy_all_children();
        emptyLbl.visible = !devices.length;
        listBox.visible = !!devices.length;
        for (const d of devices) {
            const row = new St.BoxLayout({
                vertical: false,
                style_class: 'material-panel-headphones-row',
                style: 'spacing: 10px; padding: 8px 10px; border-radius: 12px;',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const ic = new St.Icon({
                style_class: 'material-panel-headphones-row-icon',
                icon_size: 20,
                y_align: Clutter.ActorAlign.CENTER,
                gicon: giconForKey('headphones', false) || Gio.ThemedIcon.new('audio-headphones-symbolic'),
            });
            const textCol = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'spacing: 2px;',
            });
            textCol.add_child(new St.Label({
                text: d.name,
                style_class: 'material-panel-headphones-name',
            }));
            textCol.add_child(new St.Label({
                text: d.pct != null ? `Battery ${d.pct}%` : 'Connected',
                style_class: 'material-panel-headphones-sub',
            }));
            const disc = new St.Button({
                style_class: 'material-panel-headphones-disconnect',
                label: 'Disconnect',
                y_align: Clutter.ActorAlign.CENTER,
            });
            const path = d.path;
            disc.connect('clicked', () => {
                try {
                    Gio.DBus.system.call(
                        BLUEZ, path, DEVICE_IFACE, 'Disconnect',
                        null, null, Gio.DBusCallFlags.NONE, -1, null, null);
                } catch (e) {
                    logError(e, 'material-panel: headphones disconnect');
                }
                closeAfter(menu);
            });
            row.add_child(ic);
            row.add_child(textCol);
            row.add_child(disc);
            listBox.add_child(row);
        }
    };

    const applyHidden = () => {
        button.visible = false;
        label.text = '';
    };

    const scan = () => {
        Gio.DBus.system.call(
            BLUEZ, '/', 'org.freedesktop.DBus.ObjectManager', 'GetManagedObjects',
            null, new GLib.VariantType('(a{oa{sa{sv}}})'),
            Gio.DBusCallFlags.NONE, -1, null,
            (_c, res) => {
                try {
                    const [objs] = Gio.DBus.system.call_finish(res).deep_unpack();
                    let best = null;
                    const devices = [];
                    for (const [path, ifaces] of Object.entries(objs)) {
                        const props = ifaces?.[DEVICE_IFACE];
                        if (!props)
                            continue;
                        let connected = false;
                        try {
                            connected = props['Connected']?.deep_unpack() === true;
                        } catch (e) {
                            connected = false;
                        }
                        if (!connected || !isAudioHeadset(props))
                            continue;
                        const pct = batteryPct(props, ifaces);
                        const name = deviceName(props);
                        const entry = {path, name, pct};
                        devices.push(entry);
                        if (!best || (pct != null && (best.pct == null || pct > best.pct)))
                            best = entry;
                    }
                    if (best) {
                        label.text = best.pct != null
                            ? `${best.name} · ${best.pct}%`
                            : best.name;
                        const g = giconForKey('headphones', false);
                        if (g)
                            icon.gicon = g;
                        button.visible = true;
                    } else {
                        applyHidden();
                    }
                    rebuildList(devices);
                } catch (e) {
                    applyHidden();
                    rebuildList([]);
                }
            });
        return GLib.SOURCE_CONTINUE;
    };

    scan();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, scan);
    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });

    button.connect('clicked', () => {
        try {
            scan();
            if (menu.isOpen)
                menuClose(menu);
            else
                menuOpen(menu);
        } catch (e) {
            logError(e, 'material-panel: headphones popup');
        }
        return Clutter.EVENT_STOP;
    });

    return button;
}
