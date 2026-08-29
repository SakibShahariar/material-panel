import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';

// Network speed widget showing upload/download rates
// Reads /proc/net/dev for interface stats
function findActiveInterface() {
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/net/dev').load_contents(null);
        if (!ok) return null;
        const text = new TextDecoder('utf-8').decode(contents);
        const lines = text.split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10) continue;
            const iface = parts[0].replace(':', '');
            if (iface === 'lo') continue;
            const rxBytes = parseInt(parts[1], 10);
            const txBytes = parseInt(parts[9], 10);
            if (rxBytes > 0 || txBytes > 0) {
                return iface;
            }
        }
    } catch (e) {}
    return null;
}

function formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function buildNetworkSpeed(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-network-speed material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
    });

    // Download icon
    let downGicon;
    try {
        const p = iconPath('network-down');
        if (Gio.File.new_for_path(p).query_exists(null))
            downGicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
        else
            downGicon = Gio.ThemedIcon.new('download-symbolic');
    } catch (e) {
        downGicon = Gio.ThemedIcon.new('download-symbolic');
    }
    const downIcon = new St.Icon({
        style_class: 'material-panel-network-speed-icon material-panel-network-speed-down-icon',
        icon_size: Math.round(15 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: downGicon,
    });

    // Upload icon
    let upGicon;
    try {
        const p = iconPath('network-up');
        if (Gio.File.new_for_path(p).query_exists(null))
            upGicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
        else
            upGicon = Gio.ThemedIcon.new('upload-symbolic');
    } catch (e) {
        upGicon = Gio.ThemedIcon.new('upload-symbolic');
    }
    const upIcon = new St.Icon({
        style_class: 'material-panel-network-speed-icon material-panel-network-speed-up-icon',
        icon_size: Math.round(15 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: upGicon,
    });

    const downLabel = new St.Label({
        style_class: 'material-panel-network-speed-label material-panel-network-speed-down-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const upLabel = new St.Label({
        style_class: 'material-panel-network-speed-label material-panel-network-speed-up-label',
        y_align: Clutter.ActorAlign.CENTER,
    });

    box.add_child(downIcon);
    box.add_child(downLabel);
    box.add_child(upIcon);
    box.add_child(upLabel);

    let iface = findActiveInterface();
    let prevRx = 0;
    let prevTx = 0;
    let primed = false;

    const readStats = () => {
        if (!iface) return null;
        try {
            const [ok, contents] = Gio.File.new_for_path('/proc/net/dev').load_contents(null);
            if (!ok) return null;
            const text = new TextDecoder('utf-8').decode(contents);
            const lines = text.split('\n');
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 10) continue;
                const name = parts[0].replace(':', '');
                if (name !== iface) continue;
                const rx = parseInt(parts[1], 10);
                const tx = parseInt(parts[9], 10);
                return {rx, tx};
            }
        } catch (e) {}
        return null;
    };

    const update = () => {
        const stats = readStats();
        if (stats) {
            if (!primed) {
                prevRx = stats.rx;
                prevTx = stats.tx;
                primed = true;
                downLabel.text = '—';
                upLabel.text = '—';
                return GLib.SOURCE_CONTINUE;
            }
            const downSpeed = Math.max(0, stats.rx - prevRx);
            const upSpeed = Math.max(0, stats.tx - prevTx);
            prevRx = stats.rx;
            prevTx = stats.tx;

            downLabel.text = formatSpeed(downSpeed);
            upLabel.text = formatSpeed(upSpeed);
            try {
                box.set_tooltip_text(`↓ ${formatSpeed(downSpeed)}  ↑ ${formatSpeed(upSpeed)}`);
            } catch (e) {}
        } else {
            // Re-scan for active interface
            iface = findActiveInterface();
            prevRx = 0;
            prevTx = 0;
            primed = false;
        }
        return GLib.SOURCE_CONTINUE;
    };

    // Prime first reading
    readStats();

    update();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, update);
    box.connect('destroy', () => { try { GLib.source_remove(id); } catch (e) {} });

    return box;
}