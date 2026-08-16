import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import UPowerGlib from 'gi://UPowerGlib';

import {iconPathPrimary} from '../lib/iconTheme.js';

// Returns null (renders nothing) on desktops with no battery, rather than
// showing a meaningless module - see panelBuilder's hasBuiltin() check for
// how a null return is distinguished from an unknown module id.
export function buildBattery() {
    let client, device;
    try {
        client = UPowerGlib.Client.new();
        device = client.get_display_device();
    } catch (e) {
        logError(e, 'material-panel: UPower unavailable, skipping battery module');
        return null;
    }

    if (!device || device.kind !== UPowerGlib.DeviceKind.BATTERY)
        return null;

    const box = new St.BoxLayout({
        style_class: 'material-panel-battery material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const icon = new St.Icon({style_class: 'material-panel-battery-icon', icon_size: 17});
    const label = new St.Label({style_class: 'material-panel-battery-label', y_align: Clutter.ActorAlign.CENTER});
    box.add_child(icon);
    box.add_child(label);

    const setIcon = key => {
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary(key)));
    };

    const update = () => {
        const pct = device.percentage;
        const charging = device.state === UPowerGlib.DeviceState.CHARGING;

        let key;
        if (charging) key = 'battery-charging';
        else if (pct >= 90) key = 'battery-full';
        else if (pct >= 60) key = 'battery-high';
        else if (pct >= 25) key = 'battery-low';
        else key = 'battery-critical';
        setIcon(key);

        label.text = `${Math.round(pct)}%`;

        const isLow = pct < 15 && !charging;
        icon.set_style_class_name(`material-panel-battery-icon${isLow ? ' warn' : ''}`);
        label.set_style_class_name(`material-panel-battery-label${isLow ? ' warn' : ''}`);
    };
    update();

    const ids = [
        device.connect('notify::percentage', update),
        device.connect('notify::state', update),
    ];
    box.connect('destroy', () => ids.forEach(id => device.disconnect(id)));

    return box;
}
