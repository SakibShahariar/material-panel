import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {iconPath, iconPathPrimary, iconPathOnAccent} from '../lib/iconTheme.js';

function decodeBytes(bytes) {
    try {
        if (bytes instanceof Uint8Array)
            return new TextDecoder('utf-8').decode(bytes);
        return String(bytes);
    } catch (e) {
        try {
            return ByteArray.toString(bytes);
        } catch (e2) {
            return '';
        }
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
    return Gio.ThemedIcon.new(key.includes('down') ? 'go-down-symbolic' : 'go-up-symbolic');
}

export function buildNetworkSpeed(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-network-speed material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
        reactive: true,
        track_hover: true,
    });

    const s = Math.round(15 * (scale || 1.0));
    const downIcon = new St.Icon({
        style_class: 'material-panel-network-speed-icon material-panel-network-speed-down-icon',
        icon_size: s,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: fileIcon('network-down', false),
    });
    const upIcon = new St.Icon({
        style_class: 'material-panel-network-speed-icon material-panel-network-speed-up-icon',
        icon_size: s,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: fileIcon('network-up', false),
    });
    const downLabel = new St.Label({
        style_class: 'material-panel-network-speed-label material-panel-network-speed-down-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '…',
    });
    const upLabel = new St.Label({
        style_class: 'material-panel-network-speed-label material-panel-network-speed-up-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '…',
    });

    box.add_child(downIcon);
    box.add_child(downLabel);
    box.add_child(upIcon);
    box.add_child(upLabel);

    // Press: swap to on-primary recolored icons (FileIcon ignores CSS color)
    const setPressedIcons = pressed => {
        downIcon.gicon = fileIcon('network-down', pressed);
        upIcon.gicon = fileIcon('network-up', pressed);
        if (pressed)
            box.add_style_class_name('pressed');
        else
            box.remove_style_class_name('pressed');
    };
    box.connect('button-press-event', () => {
        setPressedIcons(true);
        return Clutter.EVENT_PROPAGATE;
    });
    box.connect('button-release-event', () => {
        setPressedIcons(false);
        return Clutter.EVENT_PROPAGATE;
    });
    box.connect('leave-event', () => {
        setPressedIcons(false);
        return Clutter.EVENT_PROPAGATE;
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
            downLabel.text = '—';
            upLabel.text = '—';
            return GLib.SOURCE_CONTINUE;
        }
        if (!primed) {
            prevRx = stats.rx;
            prevTx = stats.tx;
            primed = true;
            downLabel.text = '0 B/s';
            upLabel.text = '0 B/s';
            return GLib.SOURCE_CONTINUE;
        }
        const down = Math.max(0, stats.rx - prevRx);
        const up = Math.max(0, stats.tx - prevTx);
        prevRx = stats.rx;
        prevTx = stats.tx;
        downLabel.text = formatSpeed(down);
        upLabel.text = formatSpeed(up);
        try {
            box.set_tooltip_text(`${iface || '?'}\n↓ ${downLabel.text}  ↑ ${upLabel.text}`);
        } catch (e) {}
        return GLib.SOURCE_CONTINUE;
    };

    tick();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, tick);
    box.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
    });

    return box;
}
