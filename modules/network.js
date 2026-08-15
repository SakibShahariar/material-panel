import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import NM from 'gi://NM';

import {iconPath} from '../lib/iconTheme.js';

export function buildNetwork() {
    const box = new St.BoxLayout({
        style_class: 'material-panel-network material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const icon = new St.Icon({style_class: 'material-panel-network-icon', icon_size: 22});
    box.add_child(icon);

    const setIcon = key => {
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath(key)));
    };
    setIcon('network-offline');

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
                setIcon('network-offline');
                return;
            }
            const type = conn.get_connection_type();
            if (type === NM.SETTING_WIRELESS_SETTING_NAME)
                setIcon('network-wifi');
            else if (type === NM.SETTING_WIRED_SETTING_NAME)
                setIcon('network-wired');
            else
                setIcon('network-wifi');
        };
        update();

        const id = client.connect('notify::primary-connection', update);
        box.connect('destroy', () => client.disconnect(id));
    });

    return box;
}
