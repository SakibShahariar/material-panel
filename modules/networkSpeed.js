import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPath, iconPathPrimary, iconPathOnAccent} from '../lib/iconTheme.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {wireFileIconPress} from '../lib/pressFx.js';

function decodeBytes(bytes) {
    try {
        if (bytes instanceof Uint8Array)
            return new TextDecoder('utf-8').decode(bytes);
        return String(bytes);
    } catch (e) {
        return '';
    }
}

function findActiveInterface() {
    try {
        const [okR, routeBytes] = Gio.File.new_for_path('/proc/net/route').load_contents(null);
        if (okR) {
            for (const line of decodeBytes(routeBytes).split('\n')) {
                const p = line.trim().split(/\s+/);
                if (p.length >= 2 && p[0] !== 'Iface' && p[1] === '00000000' && p[0] !== 'lo')
                    return p[0];
            }
        }
    } catch (e) {}
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/net/dev').load_contents(null);
        if (!ok)
            return null;
        let best = null, bestT = -1;
        for (const line of decodeBytes(contents).split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10)
                continue;
            const iface = parts[0].replace(':', '');
            if (!iface || iface === 'lo')
                continue;
            const t = (parseInt(parts[1], 10) || 0) + (parseInt(parts[9], 10) || 0);
            if (t > bestT) {
                bestT = t;
                best = iface;
            }
        }
        return best;
    } catch (e) {}
    return null;
}

function formatSpeed(n) {
    n = Math.max(0, Number(n) || 0);
    if (n < 1024)
        return `${Math.round(n)} B/s`;
    if (n < 1024 * 1024)
        return `${(n / 1024).toFixed(1)} KB/s`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB/s`;
}

function readStats(iface) {
    if (!iface)
        return null;
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/net/dev').load_contents(null);
        if (!ok)
            return null;
        for (const line of decodeBytes(contents).split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10)
                continue;
            if (parts[0].replace(':', '') !== iface)
                continue;
            return {rx: parseInt(parts[1], 10) || 0, tx: parseInt(parts[9], 10) || 0};
        }
    } catch (e) {}
    return null;
}

function fileIcon(key, onAccent) {
    try {
        let p = onAccent ? iconPathOnAccent(key) : iconPathPrimary(key);
        if (!Gio.File.new_for_path(p).query_exists(null))
            p = iconPath(key);
        if (Gio.File.new_for_path(p).query_exists(null))
            return Gio.FileIcon.new(Gio.File.new_for_path(p));
    } catch (e) {}
    return Gio.ThemedIcon.new('network-transmit-receive-symbolic');
}

export function buildNetworkSpeed(_extensionPath, scale = 1.0) {
    let last = {down: 0, up: 0, downText: '—', upText: '—', iface: null};

    const icon = new St.Icon({
        style_class: 'material-panel-network-speed-icon',
        icon_size: Math.round(17 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: fileIcon('network-down', false),
    });

    const button = new St.Button({
        style_class: 'material-panel-network-speed material-panel-chip material-panel-network-speed-btn',
        reactive: true,
        track_hover: true,
        child: icon,
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-net-speed-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-net-speed-popup-body',
    });
    const title = new St.Label({
        text: 'Network speed',
        style_class: 'material-panel-net-speed-popup-title',
    });
    const ifaceL = new St.Label({text: '—', style_class: 'material-panel-net-speed-popup-iface'});
    const downL = new St.Label({text: '↓ —', style_class: 'material-panel-net-speed-popup-down'});
    const upL = new St.Label({text: '↑ —', style_class: 'material-panel-net-speed-popup-up'});
    body.add_child(title);
    body.add_child(ifaceL);
    body.add_child(downL);
    body.add_child(upL);
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    const refreshPopup = () => {
        ifaceL.text = last.iface ? `Interface: ${last.iface}` : 'Interface: —';
        downL.text = `↓ Download  ${last.downText}`;
        upL.text = `↑ Upload  ${last.upText}`;
    };

    wireFileIconPress(button, () => [{icon, key: 'network-down'}]);

    button.connect('clicked', () => {
        if (menu.isOpen)
            menu.close();
        else {
            refreshPopup();
            menu.open();
        }
    });

    let iface = findActiveInterface();
    let prevRx = 0, prevTx = 0, primed = false;

    const tick = () => {
        if (!iface)
            iface = findActiveInterface();
        const stats = readStats(iface);
        if (!stats) {
            iface = findActiveInterface();
            primed = false;
            last = {down: 0, up: 0, downText: '—', upText: '—', iface};
            try {
                button.set_tooltip_text('Network speed\nNo interface');
            } catch (e) {}
            if (menu.isOpen)
                refreshPopup();
            return GLib.SOURCE_CONTINUE;
        }
        if (!primed) {
            prevRx = stats.rx;
            prevTx = stats.tx;
            primed = true;
            last = {down: 0, up: 0, downText: '0 B/s', upText: '0 B/s', iface};
            return GLib.SOURCE_CONTINUE;
        }
        const down = Math.max(0, stats.rx - prevRx);
        const up = Math.max(0, stats.tx - prevTx);
        prevRx = stats.rx;
        prevTx = stats.tx;
        last = {
            down, up,
            downText: formatSpeed(down),
            upText: formatSpeed(up),
            iface,
        };
        try {
            button.set_tooltip_text(
                `${iface}\n↓ ${last.downText}\n↑ ${last.upText}`);
        } catch (e) {}
        if (menu.isOpen)
            refreshPopup();
        return GLib.SOURCE_CONTINUE;
    };

    tick();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, tick);
    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
        menu.destroy();
    });

    return button;
}
