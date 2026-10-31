import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import NM from 'gi://NM';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss, closeAfter} from '../lib/popupDismiss.js';
import {menuToggle} from '../lib/shellCompat.js';

import {iconPathPrimary} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';
import {networkIconForType} from '../lib/networkIcon.js';
import {setChipA11y} from '../lib/a11y.js';
import {findBestAccessPoint, getAccessPointInfo} from '../lib/wifiAccessPoints.js';

// Only reconnects to networks NetworkManager already has a saved profile
// for. Connecting to a brand-new network (entering a password) needs NM's
// "secret agent" D-Bus flow, which is a separate, more involved feature -
// not attempted here.
export function buildNetwork(_extensionPath, scale = 1.0) {
    let destroyed = false;
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
    setChipA11y(button, 'Network status unavailable');

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);
    button.connect('clicked', () => menuToggle(menu));
    button.connect('destroy', () => {
        destroyed = true;
        menu.destroy();
    });

    NM.Client.new_async(null, (_obj, res) => {
        let client;
        try {
            client = NM.Client.new_finish(res);
        } catch (e) {
            if (!destroyed) {
                logError(e, 'material-panel: NetworkManager unavailable');
                setChipA11y(button, 'NetworkManager unavailable');
                // An empty popup looks like there are simply no networks.
                // Surface the actual failure so users can distinguish it.
                menu.addMenuItem(new PopupMenu.PopupMenuItem(
                    'NetworkManager unavailable',
                    {reactive: false},
                ));
                const settingsItem = new PopupMenu.PopupMenuItem('Network settings…');
                settingsItem.connect('activate', closeAfter(menu, () => {
                    try {
                        GLib.spawn_command_line_async('gnome-control-center network');
                    } catch (launchError) {
                        logError(launchError, 'material-panel: open network settings failed');
                    }
                }));
                menu.addMenuItem(settingsItem);
            }
            return;
        }
        // The panel may have been rebuilt while NetworkManager initialized.
        // Finish the async operation, but don't attach UI or signals to a dead chip.
        if (destroyed)
            return;

        let currentIconKey = 'network-offline';
        const setIcon = key => {
            currentIconKey = key;
            icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary(key)));
        };

        const updateStatusIcon = () => {
            const conn = client.get_primary_connection();
            if (!conn) {
                setIcon('network-offline');
                setChipA11y(button, client.wireless_enabled ? 'Offline' : 'Wi-Fi disabled');
                return;
            }
            const type = String(conn.get_connection_type() ?? '');
            setIcon(networkIconForType(type, NM));
            if (type.includes('wireless'))
                setChipA11y(button, 'Wi-Fi enabled, connected');
            else if (type.includes('ethernet'))
                setChipA11y(button, 'Wired connection active');
            else
                setChipA11y(button, type ? type + ' connection active' : 'Network connected');
        };
        updateStatusIcon();
        const primaryConnId = client.connect('notify::primary-connection', updateStatusIcon);

        const wifiToggle = new PopupMenu.PopupSwitchMenuItem('Wi-Fi', !!client.wireless_enabled);
        wifiToggle.connect('toggled', item => {
            const want = !!item.state;
            try {
                // NetworkManager owns the radio state; avoid a redundant nmcli
                // subprocess and let notify::wireless-enabled synchronize UI.
                client.wireless_enabled = want;
            } catch (e) {
                logError(e, 'material-panel: NM wireless_enabled set failed');
            }
        });
        const wirelessEnabledId = client.connect('notify::wireless-enabled', () => {
            try {
                wifiToggle.setToggleState(!!client.wireless_enabled);
            } catch (e) {}
            updateStatusIcon();
        });
        menu.addMenuItem(wifiToggle);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const networksSection = new PopupMenu.PopupMenuSection();
        try {
            networksSection.actor.style = 'max-height: 280px;';
        } catch (e) {}
        menu.addMenuItem(networksSection);

        let wifiDevice = null;
        let wifiDeviceSignalIds = [];
        let scanStatus = '';
        let scanInFlight = false;
        let scanCancellable = null;

        const setScanStatus = message => {
            scanStatus = message || '';
            if (!destroyed)
                rebuildNetworkList();
        };

        const bindWifiDevice = () => {
            for (const id of wifiDeviceSignalIds) {
                try { wifiDevice?.disconnect(id); } catch (e) {}
            }
            wifiDeviceSignalIds = [];
            try {
                wifiDevice = client.get_devices().find(d =>
                    d.get_device_type() === NM.DeviceType.WIFI) || null;
            } catch (e) {
                wifiDevice = null;
            }
            if (!wifiDevice)
                return;
            for (const signal of ['access-point-added', 'access-point-removed', 'notify::access-points']) {
                try {
                    wifiDeviceSignalIds.push(wifiDevice.connect(signal, () => {
                        if (!destroyed)
                            rebuildNetworkList();
                    }));
                } catch (e) {}
            }
        };

        const activate = connection => {
            if (!wifiDevice)
                return;
            client.activate_connection_async(connection, wifiDevice, null, null, (c, res) => {
                try {
                    client.activate_connection_finish(res);
                    setScanStatus('');
                } catch (e) {
                    logError(e, 'material-panel: failed to activate network connection');
                    setScanStatus('Connection failed. Check the saved password or open Wi-Fi settings.');
                }
            });
        };

        const rebuildNetworkList = () => {
            networksSection.removeAll();
            const activeId = client.get_primary_connection()?.get_uuid();
            const accessPoints = wifiDevice?.get_access_points?.() || [];
            const savedConnections = client.get_connections()
                .filter(c => c.get_connection_type() === NM.SETTING_WIRELESS_SETTING_NAME);
            const savedBySsid = new Map();
            for (const connection of savedConnections) {
                const ap = findBestAccessPoint(connection, accessPoints);
                if (ap) {
                    const key = (() => {
                        try {
                            const ssid = connection.get_setting_wireless()?.get_ssid()?.get_data?.();
                            return ssid ? Array.from(ssid).join(',') : null;
                        } catch (e) {
                            return null;
                        }
                    })();
                    if (key)
                        savedBySsid.set(key, connection);
                }
            }

            const visibleEntries = [];
            const seen = new Set();
            for (const ap of accessPoints) {
                const info = getAccessPointInfo(ap);
                if (!info?.ssid)
                    continue;
                const raw = (() => {
                    try {
                        const data = ap.get_ssid()?.get_data?.();
                        return data ? Array.from(data).join(',') : null;
                    } catch (e) {
                        return null;
                    }
                })();
                if (!raw || seen.has(raw))
                    continue;
                seen.add(raw);
                const connection = savedBySsid.get(raw) || null;
                visibleEntries.push({ap, info, connection});
            }
            visibleEntries.sort((a, b) => b.info.strength - a.info.strength ||
                a.info.ssid.localeCompare(b.info.ssid));

            if (visibleEntries.length === 0 && savedConnections.length === 0) {
                networksSection.addMenuItem(new PopupMenu.PopupMenuItem(
                    'No Wi-Fi networks found', {reactive: false}));
            } else {
                for (const entry of visibleEntries) {
                    const {info, connection} = entry;
                    const security = info.secure ? '🔒' : 'Open';
                    const label = connection
                        ? `${connection.get_id()} · ${info.strength}% · ${security}`
                        : `${info.ssid} · ${info.strength}% · ${security} · Not saved`;
                    const item = new PopupMenu.PopupMenuItem(label, {
                        reactive: Boolean(connection),
                    });
                    if (connection) {
                        if (connection.get_uuid() === activeId)
                            item.setOrnament(PopupMenu.Ornament.DOT);
                        item.connect('activate', () => activate(connection));
                    }
                    networksSection.addMenuItem(item);
                }

                const inRange = new Set(visibleEntries.filter(e => e.connection)
                    .map(e => e.connection.get_uuid()));
                for (const connection of savedConnections) {
                    if (inRange.has(connection.get_uuid()))
                        continue;
                    const item = new PopupMenu.PopupMenuItem(
                        `${connection.get_id()} · Saved · Not in range`,
                        {reactive: false});
                    if (connection.get_uuid() === activeId)
                        item.setOrnament(PopupMenu.Ornament.DOT);
                    networksSection.addMenuItem(item);
                }
            }
            if (scanStatus)
                networksSection.addMenuItem(new PopupMenu.PopupMenuItem(scanStatus, {reactive: false}));
        };

        const requestWifiScan = () => {
            if (!wifiDevice || scanInFlight || destroyed)
                return;
            scanInFlight = true;
            scanStatus = 'Scanning for nearby networks…';
            rebuildNetworkList();
            scanCancellable = new Gio.Cancellable();
            try {
                wifiDevice.request_scan_async(scanCancellable, (device, result) => {
                    scanInFlight = false;
                    try {
                        device.request_scan_finish(result);
                        scanStatus = 'Scan requested; waiting for nearby network results…';
                    } catch (e) {
                        scanStatus = 'Wi-Fi scan unavailable. Check NetworkManager permissions.';
                        logError(e, 'material-panel: Wi-Fi scan failed');
                    }
                    if (!destroyed)
                        rebuildNetworkList();
                });
            } catch (e) {
                scanInFlight = false;
                scanStatus = 'Unable to request a Wi-Fi scan.';
                logError(e, 'material-panel: unable to request Wi-Fi scan');
                rebuildNetworkList();
            }
        };

        bindWifiDevice();
        rebuildNetworkList();
        menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                bindWifiDevice();
                rebuildNetworkList();
                requestWifiScan();
            }
        });
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
        const devicesChangedIds = [
            client.connect('device-added', () => {
                bindWifiDevice();
                rebuildNetworkList();
            }),
            client.connect('device-removed', () => {
                bindWifiDevice();
                rebuildNetworkList();
            }),
        ];

        button.connect('destroy', () => {
            client.disconnect(primaryConnId);
            client.disconnect(wirelessEnabledId);
            client.disconnect(connsChangedId);
            client.disconnect(connsRemovedId);
            client.disconnect(activeChangedId);
            for (const id of devicesChangedIds) {
                try { client.disconnect(id); } catch (e) {}
            }
            for (const id of wifiDeviceSignalIds) {
                try { wifiDevice?.disconnect(id); } catch (e) {}
            }
            wifiDeviceSignalIds = [];
            try { scanCancellable?.cancel(); } catch (e) {}
        });
    });

    try { wireFileIconPress(button, () => [{icon, key: currentIconKey}]); } catch (e) {}
    return button;
}
