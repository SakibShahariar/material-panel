import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import NM from 'gi://NM';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss, closeAfter} from '../lib/popupDismiss.js';

import {iconPathPrimary} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';

// Only reconnects to networks NetworkManager already has a saved profile
// for. Connecting to a brand-new network (entering a password) needs NM's
// "secret agent" D-Bus flow, which is a separate, more involved feature -
// not attempted here.
export function buildNetwork(_extensionPath, scale = 1.0) {
    const button = new St.Button({
        style_class: 'material-panel-network material-panel-chip',
        reactive: true,
    });
    const box = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER});
    const icon = new St.Icon({
        style_class: 'material-panel-network-icon',
        icon_size: Math.round(17 * scale),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('network-offline'))),
    });
    box.add_child(icon);
    button.set_child(box);

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);
    button.connect('clicked', () => menu.toggle());
    button.connect('destroy', () => menu.destroy());

    NM.Client.new_async(null, (_obj, res) => {
        let client;
        try {
            client = NM.Client.new_finish(res);
        } catch (e) {
            logError(e, 'material-panel: NetworkManager unavailable');
            return;
        }

        const setIcon = key => {
            icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary(key)));
        };

        const updateStatusIcon = () => {
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
        updateStatusIcon();
        const primaryConnId = client.connect('notify::primary-connection', updateStatusIcon);

        const wifiToggle = new PopupMenu.PopupSwitchMenuItem('Wi-Fi', client.wireless_enabled);
        wifiToggle.connect('toggled', item => {
            client.wireless_enabled = item.state;
        });
        const wirelessEnabledId = client.connect('notify::wireless-enabled', () => {
            wifiToggle.setToggleState(client.wireless_enabled);
        });
        menu.addMenuItem(wifiToggle);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const networksSection = new PopupMenu.PopupMenuSection();
        menu.addMenuItem(networksSection);

        const activate = connection => {
            const device = client.get_devices().find(d => d.get_device_type() === NM.DeviceType.WIFI);
            if (!device)
                return;
            client.activate_connection_async(connection, device, null, null, (c, res) => {
                try {
                    client.activate_connection_finish(res);
                } catch (e) {
                    logError(e, 'material-panel: failed to activate network connection');
                }
            });
        };

        const rebuildNetworkList = () => {
            networksSection.removeAll();
            const activeId = client.get_primary_connection()?.get_uuid();
            const wifiConnections = client.get_connections()
                .filter(c => c.get_connection_type() === NM.SETTING_WIRELESS_SETTING_NAME);

            if (wifiConnections.length === 0) {
                const empty = new PopupMenu.PopupMenuItem('No saved networks', {reactive: false});
                networksSection.addMenuItem(empty);
                return;
            }

            for (const conn of wifiConnections) {
                const item = new PopupMenu.PopupMenuItem(conn.get_id());
                if (conn.get_uuid() === activeId)
                    item.setOrnament(PopupMenu.Ornament.DOT);
                item.connect('activate', () => activate(conn));
                networksSection.addMenuItem(item);
            }
        };
        rebuildNetworkList();
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = new PopupMenu.PopupMenuItem('Wi-Fi settings…');
        settingsItem.connect('activate', closeAfter(menu, () => {
            // Unknown networks / passwords need the system UI (secret agent)
            const tryCmds = [
                'gnome-control-center wifi',
                'gnome-control-center network',
            ];
            for (const cmd of tryCmds) {
                try {
                    GLib.spawn_command_line_async(cmd);
                    break;
                } catch (e) {}
            }
        }));
        menu.addMenuItem(settingsItem);

        const connsChangedId = client.connect('connection-added', rebuildNetworkList);
        const connsRemovedId = client.connect('connection-removed', rebuildNetworkList);
        const activeChangedId = client.connect('notify::primary-connection', rebuildNetworkList);

        button.connect('destroy', () => {
            client.disconnect(primaryConnId);
            client.disconnect(wirelessEnabledId);
            client.disconnect(connsChangedId);
            client.disconnect(connsRemovedId);
            client.disconnect(activeChangedId);
        });
    });

    try { wireFileIconPress(button, () => [{icon, key: 'network-wifi'}]); } catch (e) {}
    return button;
}
