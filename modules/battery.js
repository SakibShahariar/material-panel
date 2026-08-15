import St from 'gi://St';
import Clutter from 'gi://Clutter';
import UPowerGlib from 'gi://UPowerGlib';

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
        style_class: 'material-panel-battery',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const icon = new St.Icon({style_class: 'material-panel-battery-icon', icon_size: 16});
    const label = new St.Label({style_class: 'material-panel-battery-label', y_align: Clutter.ActorAlign.CENTER});
    box.add_child(icon);
    box.add_child(label);

    const iconNameFor = () => {
        const pct = device.percentage;
        const charging = device.state === UPowerGlib.DeviceState.CHARGING;
        let level;
        if (pct >= 95) level = 'full';
        else if (pct >= 65) level = 'good';
        else if (pct >= 35) level = 'low';
        else if (pct >= 10) level = 'caution';
        else level = 'empty';
        return `battery-${level}${charging ? '-charging' : ''}-symbolic`;
    };

    const update = () => {
        icon.icon_name = iconNameFor();
        label.text = `${Math.round(device.percentage)}%`;
    };
    update();

    const ids = [
        device.connect('notify::percentage', update),
        device.connect('notify::state', update),
    ];
    box.connect('destroy', () => ids.forEach(id => device.disconnect(id)));

    return box;
}
