import St from 'gi://St';
import {createPopupHeader} from '../lib/popupHeader.js';
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
import {findBestAccessPoint, getAccessPointInfo, ssidKey} from '../lib/wifiAccessPoints.js';
import {addAndActivateWifiConnection, createWifiActivationGate, reportWifiActivationStatus} from '../lib/wifiConnection.js';
import {signalGlyph, sortAccessPoints, parseArpNeighbors, classifyCaptivePortal} from '../lib/networkDesign.js';
import {loadHiddenNetworks, saveHiddenNetworks, toggleHiddenNetwork} from '../lib/hiddenNetworks.js';
import {probeCaptivePortal, getNearbyDevices} from '../lib/networkDiagnostics.js';

// Saved profiles are reactivated directly; unsaved access points are
// activated through NetworkManager's session secret-agent flow below.
export function buildNetwork(_extensionPath, scale = 1.0) {
    let destroyed = false;
    const activationCancellables = new Set();
    const activationGate = createWifiActivationGate();
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
    const chipLabel = new St.Label({
        text: '',
        style_class: 'material-panel-network-chip-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(chipLabel);
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
        for (const cancellable of activationCancellables) {
            try { cancellable.cancel(); } catch (error) {}
        }
        activationCancellables.clear();
        activationGate.clear();
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

        const connectionStatus = new St.Label({
            text: 'Checking connection…',
            style_class: 'material-panel-network-popup-status',
        });
        try { connectionStatus.style = 'font-size: 11px; opacity: 0.7;'; } catch (e) {}
        const updateStatusIcon = () => {
            const conn = client.get_primary_connection();
            if (!conn) {
                connectionStatus.text = 'Offline';
                setIcon('network-offline');
                try { chipLabel.text = ''; } catch (e) {}
                setChipA11y(button, client.wireless_enabled ? 'Offline' : 'Wi-Fi disabled');
                return;
            }
            const type = String(conn.get_connection_type() ?? '');
            connectionStatus.text = type.includes('wireless') ? 'Wi-Fi connected'
                : type.includes('ethernet') ? 'Wired connection'
                    : 'Network connected';
            setIcon(networkIconForType(type, NM));
            updateChipLabel();
            if (type.includes('wireless'))
                setChipA11y(button, 'Wi-Fi enabled, connected');
            else if (type.includes('ethernet'))
                setChipA11y(button, 'Wired connection active');
            else
                setChipA11y(button, type ? type + ' connection active' : 'Network connected');
        };
        const activeWifiInfo = () => {
            try {
                const conn = client.get_primary_connection();
                if (!conn || !String(conn.get_connection_type() ?? '').includes('wireless'))
                    return null;
                const ap = conn.get_access_points?.()?.[0] ?? null;
                return ap ? getAccessPointInfo(ap) : null;
            } catch (e) {
                return null;
            }
        };
        const updateChipLabel = () => {
            try {
                const info = activeWifiInfo();
                chipLabel.text = info?.ssid
                    ? `${info.ssid.slice(0, 16)} ${signalGlyph(info.strength)}`
                    : '';
            } catch (e) {
                chipLabel.text = '';
            }
        };
        updateStatusIcon();
        const networkTitle = new St.Label({text: 'Network', style_class: 'material-panel-cpu-popup-title'});
        const {actor: networkHeader} = createPopupHeader({
            titleActor: networkTitle,
            statusActor: connectionStatus,
            styleClass: 'material-panel-network-popup-header',
            style: 'spacing: 8px; padding: 4px 2px;',
        });
        const networkHeaderItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        networkHeaderItem.add_child(networkHeader);
        menu.addMenuItem(networkHeaderItem);
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

        // Adapter switcher appears only with 2+ Wi-Fi radios (elliot/penguine style).
        const adapterSection = new PopupMenu.PopupMenuSection();
        const adapterItems = [];
        const adapterTitle = new PopupMenu.PopupMenuItem('Wi-Fi adapter', {reactive: false});
        adapterTitle.label.style = 'font-size: 10px; opacity: 0.6;';
        adapterSection.addMenuItem(adapterTitle);
        menu.addMenuItem(adapterSection);
        const adapterName = (device, index) => {
            const iface = device?.get_interface?.() || `Wi-Fi ${index + 1}`;
            const match = iface.match(/^wlp(\d+)s(\d+)(?:f(\d+)u(\d+))?/);
            if (match)
                return `Wi-Fi ${match[3] || match[1]}`;
            return iface;
        };
        const updateAdapterSwitcher = () => {
            adapterSection.removeAll();
            adapterSection.addMenuItem(adapterTitle);
            adapterItems.length = 0;
            adapterSection.visible = wifiDevices.length > 1;
            if (!adapterSection.visible)
                return;
            wifiDevices.forEach((device, index) => {
                const item = new PopupMenu.PopupMenuItem(
                    `${index === wifiDeviceIndex ? '● ' : '   '}${adapterName(device, index)}`, {reactive: true});
                item.connect('activate', () => {
                    wifiDeviceIndex = index;
                    bindWifiDevice();
                    rebuildNetworkList();
                });
                adapterItems.push(item);
                adapterSection.addMenuItem(item);
            });
        };

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const networksSection = new PopupMenu.PopupMenuSection();
        try {
            networksSection.actor.style = 'max-height: 280px;';
        } catch (e) {}
        menu.addMenuItem(networksSection);

        let wifiDevice = null;
        let wifiDevices = [];
        let wifiDeviceIndex = 0;
        let wifiDeviceSignalIds = [];
        let scanStatus = '';
        let scanInFlight = false;
        let scanCancellable = null;

        const setScanStatus = message => {
            scanStatus = message || '';
            if (!destroyed)
                rebuildNetworkList();
        };

        const updateActivationStatus = message => reportWifiActivationStatus(
            setScanStatus,
            message,
            error => {
                try { logError(error, 'material-panel: could not update Wi-Fi activation status'); } catch (ignored) {}
            },
        );

        const bindWifiDevice = () => {
            for (const id of wifiDeviceSignalIds) {
                try { wifiDevice?.disconnect(id); } catch (e) {}
            }
            wifiDeviceSignalIds = [];
            try {
                wifiDevices = client.get_devices().filter(d =>
                    d.get_device_type() === NM.DeviceType.WIFI);
            } catch (e) {
                wifiDevices = [];
            }
            if (wifiDevices.length > 1) {
                // Snap to the radio carrying the default route (elliot style).
                try {
                    const primary = client.get_primary_connection();
                    const primaryAp = primary?.get_access_points?.()?.[0];
                    const routeIndex = primaryAp
                        ? wifiDevices.findIndex(d =>
                            d.get_access_points?.().some(a => a?.get_path?.() === primaryAp?.get_path?.()))
                        : -1;
                    if (routeIndex >= 0)
                        wifiDeviceIndex = routeIndex;
                } catch (e) {}
            }
            wifiDeviceIndex = Math.max(0, Math.min(wifiDeviceIndex, wifiDevices.length - 1));
            wifiDevice = wifiDevices[wifiDeviceIndex] || null;
            updateAdapterSwitcher();
            if (!wifiDevice)
                return;
            for (const signal of ['access-point-added', 'access-point-removed', 'notify::access-points']) {
                try {
                    wifiDeviceSignalIds.push(wifiDevice.connect(signal, () => {
                        scanStatus = '';
                        scanInFlight = false;
                        if (!destroyed)
                            rebuildNetworkList();
                    }));
                } catch (e) {}
            }
        };

        const activationSignals = new Set();
        const watchActivation = (activeConnection, ssid, onSettled = () => {}) => {
            let settled = false;
            let signalId = 0;
            const disconnect = () => {
                if (!signalId)
                    return;
                try { activeConnection.disconnect(signalId); } catch (e) {}
                activationSignals.delete(disconnect);
                signalId = 0;
            };
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                disconnect();
                try { onSettled(); } catch (error) {}
            };
            if (!activeConnection || destroyed) {
                finish();
                return;
            }
            const updateActivation = () => {
                if (destroyed) {
                    finish();
                    return;
                }
                let state;
                try { state = activeConnection.get_state(); } catch (e) { return; }
                if (state === NM.ActiveConnectionState.ACTIVATED) {
                    updateActivationStatus(`Connected to ${ssid}`);
                    finish();
                } else if (state === NM.ActiveConnectionState.DEACTIVATED) {
                    updateActivationStatus(`Couldn't connect to ${ssid}. Check the password or network security.`);
                    finish();
                }
            };
            try {
                signalId = activeConnection.connect('notify::state', updateActivation);
                if (!signalId)
                    throw new Error('NetworkManager did not provide an activation state signal');
                activationSignals.add(disconnect);
                updateActivation();
            } catch (error) {
                finish();
                if (!destroyed) {
                    try { logError(error, 'material-panel: could not watch Wi-Fi activation state'); } catch (ignored) {}
                    updateActivationStatus(`Could not monitor the connection to ${ssid}. Check Network settings.`);
                }
            }
        };

        const getActivationKey = (connection, accessPoint, ssid) => {
            if (connection) {
                try {
                    const uuid = connection.get_uuid?.();
                    if (typeof uuid === 'string' && uuid)
                        return `connection:${uuid}`;
                } catch (error) {}
            }
            try {
                const path = accessPoint?.get_path?.();
                if (typeof path === 'string' && path)
                    return `access-point:${path}`;
            } catch (error) {}
            return `ssid:${String(ssid || '')}`;
        };

        const activate = (connection, accessPoint = null, ssid = 'Wi-Fi network') => {
            if (!wifiDevice || destroyed)
                return;
            const activationKey = getActivationKey(connection, accessPoint, ssid);
            if (!activationGate.begin(activationKey))
                return;
            const finishActivation = () => activationGate.finish(activationKey);
            if (connection) {
                updateActivationStatus(`Connecting to ${ssid}…`);
                const cancellable = new Gio.Cancellable();
                activationCancellables.add(cancellable);
                let completed = false;
                const release = () => activationCancellables.delete(cancellable);
                try {
                    client.activate_connection_async(connection, wifiDevice, null, cancellable, (c, res) => {
                        if (completed)
                            return;
                        completed = true;
                        release();
                        if (destroyed) {
                            finishActivation();
                            return;
                        }
                        try {
                            const activeConnection = c.activate_connection_finish(res);
                            if (!activeConnection)
                                throw new Error('NetworkManager did not return an active connection');
                            watchActivation(activeConnection, ssid, finishActivation);
                        } catch (error) {
                            finishActivation();
                            logError(error, 'material-panel: failed to activate saved network connection');
                            updateActivationStatus('Connection failed. Check the saved password or open Wi-Fi settings.');
                        }
                    });
                } catch (error) {
                    if (completed)
                        return;
                    completed = true;
                    release();
                    finishActivation();
                    if (!destroyed) {
                        logError(error, 'material-panel: failed to start saved network activation');
                        updateActivationStatus('Connection failed. Check the saved password or open Wi-Fi settings.');
                    }
                }
                return;
            }

            // Let NetworkManager create a profile from the selected AP and use
            // GNOME Shell's registered secret agent for any required password.
            // The extension never reads or persists Wi-Fi credentials itself.
            updateActivationStatus(`Connecting to ${ssid}…`);
            const cancellable = new Gio.Cancellable();
            activationCancellables.add(cancellable);
            addAndActivateWifiConnection(client, wifiDevice, accessPoint, {
                cancellable,
                onStarted: activeConnection => {
                    activationCancellables.delete(cancellable);
                    watchActivation(activeConnection, ssid, finishActivation);
                },
                onError: error => {
                    activationCancellables.delete(cancellable);
                    finishActivation();
                    if (destroyed)
                        return;
                    logError(error, 'material-panel: failed to connect to new Wi-Fi network');
                    updateActivationStatus(`Couldn't connect to ${ssid}. Check the password or network security.`);
                },
            });
        };

        let hiddenNetworks = loadHiddenNetworks();
        let hiddenExpanded = false;

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
                    const key = ssidKey(connection.get_setting_wireless()?.get_ssid());
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
                const raw = ssidKey(ap.get_ssid?.());
                if (!raw || seen.has(raw))
                    continue;
                seen.add(raw);
                const connection = savedBySsid.get(raw) || null;
                visibleEntries.push({ap, info, connection, ssid: info.ssid});
            }
            const sorted = sortAccessPoints(visibleEntries, {activeUuid: activeId, hidden: hiddenNetworks});

            const stateLabel = text => {
                const item = new PopupMenu.PopupMenuItem('', {reactive: false});
                item.label.text = text;
                item.label.style = 'font-size: 10px; opacity: 0.6;';
                return item;
            };

            if (sorted.length === 0 && savedConnections.length === 0) {
                networksSection.addMenuItem(new PopupMenu.PopupMenuItem(
                    'No Wi-Fi networks found', {reactive: false}));
            } else {
                let sectionTitle = '';
                for (const entry of sorted) {
                    const {info, connection} = entry;
                    const active = connection && connection.get_uuid() === activeId;
                    const group = active ? 'CONNECTED' : connection ? 'KNOWN NETWORKS' : 'OTHER NETWORKS';
                    if (group !== sectionTitle) {
                        sectionTitle = group;
                        networksSection.addMenuItem(stateLabel(group));
                    }
                    const bars = signalGlyph(info.strength) || '·';
                    const state = scanStatus.includes(info.ssid)
                        ? (scanStatus.includes('Connecting') ? 'Connecting…' : 'Working…')
                        : active ? 'Connected' : connection ? '' : 'Connect';
                    const label = `${bars}  ${info.ssid}  ${info.strength}%${info.secure ? '  🔒' : ''}${state ? `  · ${state}` : ''}`;
                    const item = new PopupMenu.PopupMenuItem(label, {reactive: true});
                    item.connect('activate', () => activate(connection, entry.ap, info.ssid));
                    // Right-click hides a network from future scans.
                    item.connect('button-press-event', (_actor, event) => {
                        if (event.get_button() !== 3)
                            return Clutter.EVENT_PROPAGATE;
                        hiddenNetworks = toggleHiddenNetwork(hiddenNetworks, info.ssid);
                        saveHiddenNetworks(hiddenNetworks);
                        rebuildNetworkList();
                        return Clutter.EVENT_STOP;
                    });
                    networksSection.addMenuItem(item);
                }

                const inRange = new Set(sorted.filter(e => e.connection)
                    .map(e => e.connection.get_uuid()));
                const outOfRange = savedConnections.filter(c => !inRange.has(c.get_uuid()));
                if (outOfRange.length) {
                    networksSection.addMenuItem(stateLabel('SAVED · NOT IN RANGE'));
                    for (const connection of outOfRange) {
                        const item = new PopupMenu.PopupMenuItem(
                            `${connection.get_id()} · Saved`, {reactive: false});
                        if (connection.get_uuid() === activeId)
                            item.setOrnament(PopupMenu.Ornament.DOT);
                        networksSection.addMenuItem(item);
                    }
                }
            }

            if (hiddenNetworks.length) {
                const hiddenItem = new PopupMenu.PopupMenuItem(
                    `HIDDEN (${hiddenNetworks.length})  ${hiddenExpanded ? '▾' : '▸'}`, {reactive: true});
                hiddenItem.connect('activate', () => {
                    hiddenExpanded = !hiddenExpanded;
                    rebuildNetworkList();
                });
                networksSection.addMenuItem(hiddenItem);
                if (hiddenExpanded) {
                    for (const ssid of hiddenNetworks) {
                        const item = new PopupMenu.PopupMenuItem(`${ssid}  · Show again`, {reactive: true});
                        item.connect('activate', () => {
                            hiddenNetworks = toggleHiddenNetwork(hiddenNetworks, ssid);
                            saveHiddenNetworks(hiddenNetworks);
                            rebuildNetworkList();
                        });
                        networksSection.addMenuItem(item);
                    }
                }
            }
            if (scanStatus)
                networksSection.addMenuItem(stateLabel(scanStatus));
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
                probePortal();
                refreshNearby();
            }
        });
        rebuildNetworkList();
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Captive-portal banner (only shown when a sign-in wall is suspected).
        const portalItem = new PopupMenu.PopupMenuItem('', {reactive: true});
        portalItem.visible = false;
        menu.addMenuItem(portalItem);
        let portalProbeInFlight = false;
        const probePortal = async () => {
            if (portalProbeInFlight || destroyed)
                return;
            portalProbeInFlight = true;
            const code = await probeCaptivePortal();
            portalProbeInFlight = false;
            if (destroyed)
                return;
            const state = classifyCaptivePortal(code);
            portalItem.visible = state === 'portal';
            if (state === 'portal') {
                portalItem.label.text = '⚠ Connected, but internet may need a sign-in — open browser';
                portalItem.label.style = 'color: #ffb4ab; font-size: 11px;';
            }
        };
        portalItem.connect('activate', closeAfter(menu, () => {
            try { GLib.spawn_command_line_async('xdg-open http://connectivitycheck.gstatic.com/generate_204'); } catch (e) {}
        }));

        // Nearby devices from the kernel ARP/NDP cache (read-only).
        const nearbySection = new PopupMenu.PopupMenuSection();
        const nearbyTitle = new PopupMenu.PopupMenuItem('Nearby devices', {reactive: false});
        nearbyTitle.label.style = 'font-size: 11px; font-weight: 700; opacity: 0.7;';
        nearbySection.addMenuItem(nearbyTitle);
        const nearbyRefresh = new PopupMenu.PopupMenuItem('Refresh', {reactive: true});
        nearbySection.addMenuItem(nearbyRefresh);
        const nearbyRows = new PopupMenu.PopupMenuSection();
        nearbySection.addMenuItem(nearbyRows);
        menu.addMenuItem(nearbySection);
        const refreshNearby = async () => {
            if (destroyed)
                return;
            const text = await getNearbyDevices();
            if (destroyed)
                return;
            nearbyRows.removeAll();
            const devices = parseArpNeighbors(text);
            if (!devices.length)
                nearbyRows.addMenuItem(new PopupMenu.PopupMenuItem('No devices found', {reactive: false}));
            for (const device of devices) {
                nearbyRows.addMenuItem(new PopupMenu.PopupMenuItem(
                    `${device.ip}  ·  ${device.mac}`, {reactive: false}));
            }
        };
        nearbyRefresh.connect('activate', refreshNearby);

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
            for (const disconnect of activationSignals) {
                try { disconnect(); } catch (e) {}
            }
            activationSignals.clear();
        });
    });

    try { wireFileIconPress(button, () => [{icon, key: currentIconKey}]); } catch (e) {}
    return button;
}
