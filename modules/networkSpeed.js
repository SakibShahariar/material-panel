import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {startNetSpeedMonitor} from '../lib/netSpeedMonitor.js';

export function buildNetworkSpeed(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-network-speed material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
        reactive: true,
        track_hover: true,
    });

    const loadIcon = (key, fallback) => {
        try {
            let p = iconPathPrimary(key);
            if (!Gio.File.new_for_path(p).query_exists(null))
                p = iconPath(key);
            if (Gio.File.new_for_path(p).query_exists(null))
                return Gio.FileIcon.new(Gio.File.new_for_path(p));
        } catch (e) {}
        return Gio.ThemedIcon.new(fallback);
    };

    const s = Math.round(15 * (scale || 1.0));
    const downIcon = new St.Icon({
        style_class: 'material-panel-network-speed-icon material-panel-network-speed-down-icon',
        icon_size: s,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: loadIcon('network-down', 'go-down-symbolic'),
    });
    const upIcon = new St.Icon({
        style_class: 'material-panel-network-speed-icon material-panel-network-speed-up-icon',
        icon_size: s,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: loadIcon('network-up', 'go-up-symbolic'),
    });
    const downLabel = new St.Label({
        style_class: 'material-panel-network-speed-label material-panel-network-speed-down-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '—',
    });
    const upLabel = new St.Label({
        style_class: 'material-panel-network-speed-label material-panel-network-speed-up-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '—',
    });

    box.add_child(downIcon);
    box.add_child(downLabel);
    box.add_child(upIcon);
    box.add_child(upLabel);

    const cancel = startNetSpeedMonitor(({downText, upText, iface}) => {
        downLabel.text = downText;
        upLabel.text = upText;
        try {
            box.set_tooltip_text(
                iface
                    ? `${iface}\n↓ ${downText}  ↑ ${upText}`
                    : `↓ ${downText}  ↑ ${upText}`);
        } catch (e) {}
    });

    box.connect('destroy', () => {
        try { cancel(); } catch (e) {}
    });

    return box;
}
