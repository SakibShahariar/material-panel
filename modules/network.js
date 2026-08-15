import St from 'gi://St';
import Clutter from 'gi://Clutter';
import NM from 'gi://NM';

export function buildNetwork() {
    const box = new St.BoxLayout({
        style_class: 'material-panel-network material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const icon = new St.Icon({
        style_class: 'material-panel-network-icon',
        icon_size: 15,
        y_align: Clutter.ActorAlign.CENTER,
        icon_name: 'network-offline-symbolic',
    });
    box.add_child(icon);

    NM.Client.new_async(null, (_obj, res) => {
        let client;
        try {
            client = NM.Client.new_finish(res);
        } catch (e) {
            logError(e, 'material-panel: NetworkManager unavailable, network module stays offline-icon');
            return;
        }

        const update = () => {
            const conn = client.get_primary_connection();
            if (!conn) {
                icon.icon_name = 'network-offline-symbolic';
                return;
            }
            const type = conn.get_connection_type();
            if (type === NM.SETTING_WIRELESS_SETTING_NAME) {
                const device = client.get_devices().find(d => d.get_active_connection() === conn);
                const ap = device && device.get_active_access_point ? device.get_active_access_point() : null;
                const strength = ap ? ap.get_strength() : 100;
                let level;
                if (strength >= 80) level = 'excellent';
                else if (strength >= 55) level = 'good';
                else if (strength >= 30) level = 'ok';
                else level = 'weak';
                icon.icon_name = `network-wireless-signal-${level}-symbolic`;
            } else if (type === NM.SETTING_WIRED_SETTING_NAME) {
                icon.icon_name = 'network-wired-symbolic';
            } else {
                icon.icon_name = 'network-cellular-signal-good-symbolic';
            }
        };
        update();

        const id = client.connect('notify::primary-connection', update);
        box.connect('destroy', () => client.disconnect(id));
    });

    return box;
}
