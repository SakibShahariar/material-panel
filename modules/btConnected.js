import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import {iconPath, iconPathPrimary, iconPathOnAccent} from '../lib/iconTheme.js';
import {wireChipPress, giconForKey} from '../lib/pressFx.js';

const BLUEZ = 'org.bluez';
const OM = 'org.freedesktop.DBus.ObjectManager';
const DEV = 'org.bluez.Device1';

function pickIconKey(props) {
    try {
        const icon = props['Icon']?.deep_unpack?.() || '';
        if (icon.includes('headset') || icon.includes('audio-headphones') || icon.includes('audio-headset'))
            return 'headphones';
        if (icon.includes('phone'))
            return 'phone';
        if (icon.includes('keyboard'))
            return 'keyboard';
    } catch (e) {}
    try {
        const cls = props['Class']?.deep_unpack?.() ?? 0;
        // Major device class bits for audio
        if ((cls & 0x1f00) === 0x0400)
            return 'headphones';
    } catch (e) {}
    return 'bluetooth-on';
}

export function buildBtConnected(_extensionPath, scale = 1.0) {
    let iconKey = 'headphones';
    const icon = new St.Icon({
        style_class: 'material-panel-bt-connected-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: giconForKey('headphones', false) || Gio.ThemedIcon.new('audio-headset-symbolic'),
    });
    const label = new St.Label({
        text: '',
        style_class: 'material-panel-bt-connected-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    try {
        label.style = 'font-size: 11px; font-weight: 600;';
    } catch (e) {}

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
        getIcons: () => [{icon, key: iconKey}],
        stickyUntilLeave: true,
    });

    const applyHidden = () => {
        button.visible = false;
        label.text = '';
    };

    const scan = () => {
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            BLUEZ, '/', OM, null,
            (_s, res) => {
                let mgr;
                try {
                    mgr = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    applyHidden();
                    return;
                }
                mgr.call('GetManagedObjects', null, Gio.DBusCallFlags.NONE, 3000, null, (p, r) => {
                    try {
                        const [objects] = p.call_finish(r).deep_unpack();
                        let best = null;
                        for (const [, ifaces] of Object.entries(objects)) {
                            if (!(DEV in ifaces))
                                continue;
                            const props = ifaces[DEV];
                            // Strict: only real connected devices
                            let connected = false;
                            try {
                                connected = props['Connected']?.deep_unpack() === true;
                            } catch (e) {
                                connected = false;
                            }
                            if (!connected)
                                continue;
                            const name = props['Alias']?.deep_unpack()
                                ?? props['Name']?.deep_unpack()
                                ?? null;
                            if (!name)
                                continue;
                            let pct = null;
                            try {
                                const bat = ifaces['org.bluez.Battery1'];
                                if (bat?.Percentage != null)
                                    pct = bat.Percentage.deep_unpack();
                            } catch (e) {}
                            // Prefer Battery Percentage from Device1 if present (newer BlueZ)
                            try {
                                if (pct == null && props['Percentage'])
                                    pct = props['Percentage'].deep_unpack();
                            } catch (e) {}
                            best = {
                                name: String(name),
                                pct,
                                iconKey: pickIconKey(props),
                            };
                            break;
                        }
                        if (best) {
                            iconKey = best.iconKey;
                            label.text = best.pct != null && Number.isFinite(Number(best.pct))
                                ? `${best.name} · ${Math.round(Number(best.pct))}%`
                                : best.name;
                            const g = giconForKey(iconKey, false);
                            if (g)
                                icon.gicon = g;
                            button.visible = true;
                        } else {
                            applyHidden();
                        }
                    } catch (e) {
                        applyHidden();
                    }
                });
            });
        return GLib.SOURCE_CONTINUE;
    };

    scan();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, scan);
    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
    });
    // Click is visual only (press state); do not open Settings
    button.connect('clicked', () => Clutter.EVENT_STOP);

    return button;
}
