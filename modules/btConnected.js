import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import {iconPathPrimary, iconPathOnAccent} from '../lib/iconTheme.js';
import {wireChipPress} from '../lib/pressFx.js';

const BLUEZ = 'org.bluez';
const OM = 'org.freedesktop.DBus.ObjectManager';
const DEV = 'org.bluez.Device1';

/**
 * Left-zone chip: only meaningful when a BT device is connected.
 * Shows device name + optional battery %.
 */
export function buildBtConnected(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        style_class: 'material-panel-bt-connected-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('bluetooth-on'))),
    });
    const label = new St.Label({
        text: '',
        style_class: 'material-panel-bt-connected-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;

    const box = new St.BoxLayout({
        style_class: 'material-panel-bt-connected',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
    });
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-bt-connected-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        child: box,
        visible: false,
    });
    wireChipPress(button, {
        getIcons: () => [{icon, key: 'bluetooth-on'}],
        stickyUntilLeave: true,
    });

    const scan = () => {
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            BLUEZ, '/', OM, null,
            (_s, res) => {
                let mgr;
                try {
                    mgr = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    button.visible = false;
                    return;
                }
                mgr.call('GetManagedObjects', null, Gio.DBusCallFlags.NONE, 3000, null, (p, r) => {
                    try {
                        const [objects] = p.call_finish(r).deep_unpack();
                        let best = null;
                        for (const [path, ifaces] of Object.entries(objects)) {
                            if (!(DEV in ifaces))
                                continue;
                            const props = ifaces[DEV];
                            if (!(props['Connected']?.deep_unpack()))
                                continue;
                            const name = props['Alias']?.deep_unpack()
                                ?? props['Name']?.deep_unpack()
                                ?? 'Device';
                            let pct = null;
                            try {
                                const bat = ifaces['org.bluez.Battery1'];
                                if (bat?.Percentage)
                                    pct = bat.Percentage.deep_unpack();
                            } catch (e) {}
                            best = {name, pct};
                            break;
                        }
                        if (best) {
                            label.text = best.pct != null
                                ? `${best.name} · ${Math.round(Number(best.pct))}%`
                                : best.name;
                            button.visible = true;
                            try {
                                icon.gicon = Gio.FileIcon.new(
                                    Gio.File.new_for_path(iconPathPrimary('bluetooth-on')));
                            } catch (e) {}
                        } else {
                            button.visible = false;
                        }
                    } catch (e) {
                        button.visible = false;
                    }
                });
            });
        return GLib.SOURCE_CONTINUE;
    };

    scan();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, scan);
    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
    });
    // Open GNOME BT settings on click
    button.connect('clicked', () => {
        try {
            GLib.spawn_command_line_async('gnome-control-center bluetooth');
        } catch (e) {}
    });

    return button;
}
