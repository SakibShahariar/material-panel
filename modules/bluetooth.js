import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPath, iconPathOnAccent, iconPathPrimary} from '../lib/iconTheme.js';

const BLUEZ_SERVICE = 'org.bluez';
const OBJECT_MANAGER_IFACE = 'org.freedesktop.DBus.ObjectManager';
const ADAPTER_IFACE = 'org.bluez.Adapter1';
const DEVICE_IFACE = 'org.bluez.Device1';
const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties';

function findAdapterPath(callback) {
    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
        BLUEZ_SERVICE, '/', OBJECT_MANAGER_IFACE, null,
        (_src, res) => {
            let objMgr;
            try {
                objMgr = Gio.DBusProxy.new_for_bus_finish(res);
            } catch (e) {
                logError(e, 'material-panel: bluez unavailable (is bluetoothd running?)');
                callback(null);
                return;
            }
            objMgr.call(
                'GetManagedObjects', null, Gio.DBusCallFlags.NONE, -1, null,
                (proxy, callRes) => {
                    try {
                        const result = proxy.call_finish(callRes);
                        const [objects] = result.deep_unpack();
                        const path = Object.keys(objects).find(p => ADAPTER_IFACE in objects[p]);
                        callback(path ?? null);
                    } catch (e) {
                        logError(e, 'material-panel: bluez GetManagedObjects failed');
                        callback(null);
                    }
                });
        });
}

function isSoftBlocked() {
    try {
        const [ok, out] = GLib.spawn_command_line_sync('rfkill list bluetooth');
        if (!ok || !out) return false;
        return new TextDecoder('utf-8').decode(out).includes('Soft blocked: yes');
    } catch (e) {
        return false;
    }
}

function makeWrappingLabel(text, styleClass) {
    const label = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    label.clutter_text.line_wrap = true;
    label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    return label;
}

function wrapAsMenuItem(actor) {
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(actor);
    return item;
}

function addPopupDismiss(menu, button) {
    const stage = global.stage;
    const isMenuOpen = () => menu.isOpen ?? menu.actor.visible;
    const clickId = stage.connect('captured-event', (_a, event) => {
        if (!isMenuOpen()) return Clutter.EVENT_PROPAGATE;
        if (event.type() !== Clutter.EventType.BUTTON_PRESS) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        if (!target) return Clutter.EVENT_PROPAGATE;
        let cur = target;
        while (cur) {
            if (cur === menu.actor || cur === button) return Clutter.EVENT_PROPAGATE;
            cur = cur.get_parent();
        }
        try {
            if (menu.actor.contains(target) || button.contains(target))
                return Clutter.EVENT_PROPAGATE;
        } catch (e) {}
        menu.close();
        return Clutter.EVENT_PROPAGATE;
    });
    const keyId = stage.connect('captured-event', (_a, event) => {
        if (!isMenuOpen()) return Clutter.EVENT_PROPAGATE;
        if (event.type() !== Clutter.EventType.KEY_PRESS) return Clutter.EVENT_PROPAGATE;
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            menu.close();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    const cleanup = () => {
        try { stage.disconnect(clickId); } catch (e) {}
        try { stage.disconnect(keyId); } catch (e) {}
    };
    menu.actor.connect('destroy', cleanup);
    button.connect('destroy', cleanup);
}

// Modern bluetooth popup — inspired by Noctalia v5 Control Center and
// End4 illogical-impulse Quickshell sidebar: header with power toggle +
// blocked/unblock state, paired-device list with per-device
// connect/disconnect, battery where exposed, live refresh via
// ObjectManager InterfacesAdded/Removed and per-device PropertiesChanged.
export function buildBluetooth(_extensionPath, scale = 1.0) {
    const button = new St.Button({
        style_class: 'material-panel-bluetooth-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            style_class: 'material-panel-bluetooth-icon',
            icon_size: Math.round(17 * (scale || 1.0)),
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off'))),
        }),
    });
    const icon = button.get_child();

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-bluetooth-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    addPopupDismiss(menu, button);

    let propsProxy = null;
    let adapterPath = null;
    let propsSignalId = 0;
    let currentlyPowered = false;
    let isBlocked = false;
    let discovering = false;

    // Header — bluetooth power switch (PopupSwitchMenuItem) + status label
    const btSwitch = new PopupMenu.PopupSwitchMenuItem('Bluetooth', false);
    // Replace switch's icon row styling to match Noctalia header: keep switch widget
    btSwitch.connect('toggled', () => {
        if (isBlocked) {
            try {
                GLib.spawn_command_line_async('rfkill unblock bluetooth');
                log('material-panel: rfkill unblock bluetooth requested (header switch)');
                btSwitch.label.text = 'Unblocking…';
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                    discover();
                    return GLib.SOURCE_REMOVE;
                });
            } catch (e) { logError(e, 'material-panel: rfkill unblock failed'); }
            // revert visual until rediscover
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                btSwitch.setToggleState(false);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        if (!propsProxy || !adapterPath) {
            discover();
            logError(new Error('material-panel: bluetooth toggle before adapter ready — retrying discovery'));
            btSwitch.setToggleState(currentlyPowered);
            return;
        }
        const want = btSwitch.state;
        propsProxy.call(
            'Set', new GLib.Variant('(ssv)', [ADAPTER_IFACE, 'Powered', new GLib.Variant('b', want)]),
            Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                try { p.call_finish(r); } catch (e) { logError(e, 'material-panel: bluez Set Powered failed'); }
            });
    });

    // Tiny helper row for rfkill blocked hint (visible only when blocked)
    const blockedHint = new St.Label({
        text: 'Soft blocked — switch to unblock',
        style_class: 'material-panel-bt-hint',
        style: 'font-style: italic; font-size: 11px; padding: 2px 8px;',
    });
    blockedHint.visible = false;
    const blockedItem = wrapAsMenuItem(blockedHint);

    // Discovering toggle — shown only when powered, mirrors End4 scanning switch
    const scanSwitch = new PopupMenu.PopupSwitchMenuItem('Discovering', false);
    scanSwitch.visible = false;
    scanSwitch.connect('toggled', () => {
        if (!propsProxy || !adapterPath) return;
        const method = scanSwitch.state ? 'StartDiscovery' : 'StopDiscovery';
        // Discovering is on Adapter1 directly, not Properties
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            BLUEZ_SERVICE, adapterPath, ADAPTER_IFACE, null,
            (_s, res) => {
                try {
                    const adapterProxy = Gio.DBusProxy.new_for_bus_finish(res);
                    adapterProxy.call(method, null, Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                        try { p.call_finish(r); } catch (e) { logError(e, `material-panel: bluez ${method} failed`); scanSwitch.setToggleState(discovering); }
                    });
                } catch (e) { logError(e, `material-panel: bluez ${method} proxy failed`); scanSwitch.setToggleState(discovering); }
            });
    });

    // Device list section — scrollable vertical box, like Noctalia's ListView
    // and End4's ScrollView of Material cards. Uses St.ScrollView to avoid
    // unbounded menu height with many paired devices.
    const devicesOuter = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'material-panel-bt-outer'});
    const devicesHeader = new St.BoxLayout({x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'material-panel-bt-devices-header'});
    const devicesHeaderLabel = new St.Label({text: 'Paired devices', style_class: 'material-panel-bt-header-label', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    const devicesHeaderCount = new St.Label({text: '', style_class: 'material-panel-bt-header-count', y_align: Clutter.ActorAlign.CENTER, style: 'font-size: 11px; opacity: 0.7;'});
    devicesHeader.add_child(devicesHeaderLabel);
    devicesHeader.add_child(devicesHeaderCount);
    devicesOuter.add_child(devicesHeader);

    const scroll = new St.ScrollView({
        style_class: 'material-panel-bt-scroll',
        x_expand: true,
        overlay_scrollbars: true,
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
    });
    scroll.set_style('max-height: 260px;');
    const devicesBox = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'material-panel-bt-devices'});
    scroll.set_child(devicesBox);
    devicesOuter.add_child(scroll);
    const devicesOuterItem = wrapAsMenuItem(devicesOuter);

    // Footer — open Settings shortcut (like Noctalia's "Open Bluetooth Settings")
    const footerBtn = new St.Button({
        style_class: 'material-panel-bt-footer-btn',
        reactive: true,
        x_expand: true,
        child: new St.Label({text: 'Open Bluetooth Settings…', style_class: 'material-panel-bt-footer-label'}),
    });
    footerBtn.connect('clicked', () => {
        try { GLib.spawn_command_line_async('gnome-control-center bluetooth'); } catch (e) {}
        menu.close();
    });
    const footerItem = wrapAsMenuItem(footerBtn);

    menu.addMenuItem(btSwitch);
    menu.addMenuItem(blockedItem);
    menu.addMenuItem(scanSwitch);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    menu.addMenuItem(devicesOuterItem);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    menu.addMenuItem(footerItem);

    const setPowered = powered => {
        currentlyPowered = powered;
        isBlocked = false;
        blockedHint.visible = false;
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath(powered ? 'bluetooth-on' : 'bluetooth-off')));
        button.set_style_class_name(`material-panel-bluetooth-btn material-panel-chip${powered ? ' active' : ''}`);
        btSwitch.setToggleState(powered);
        btSwitch.label.text = powered ? 'Bluetooth — On' : 'Bluetooth — Off';
        scanSwitch.visible = powered;
        if (!powered) scanSwitch.setToggleState(false);
        // Dim device list when off
        devicesOuter.opacity = powered ? 255 : 90;
    };

    const setDiscovering = on => {
        discovering = on;
        scanSwitch.setToggleState(on);
    };

    const setBlockedState = () => {
        isBlocked = true;
        currentlyPowered = false;
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off')));
        button.set_style_class_name('material-panel-bluetooth-btn material-panel-chip');
        btSwitch.setToggleState(false);
        btSwitch.label.text = 'Bluetooth — Blocked';
        blockedHint.visible = true;
        scanSwitch.visible = false;
        devicesOuter.opacity = 90;
        devicesHeaderLabel.text = 'Paired devices — blocked';
        log('material-panel: bluetooth — rfkill soft blocked, tap switch to unblock');
    };

    const setNoAdapterState = () => {
        isBlocked = false;
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off')));
        button.set_style_class_name('material-panel-bluetooth-btn material-panel-chip');
        btSwitch.setToggleState(false);
        btSwitch.label.text = 'Bluetooth — No adapter';
        blockedHint.visible = false;
        scanSwitch.visible = false;
        devicesHeaderLabel.text = 'Paired devices — no adapter';
        devicesOuter.opacity = 90;
    };

    const bindAdapter = path => {
        adapterPath = path;
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            BLUEZ_SERVICE, path, PROPERTIES_IFACE, null,
            (_src, res) => {
                try {
                    propsProxy = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    logError(e, 'material-panel: bluez properties proxy failed');
                    setNoAdapterState();
                    return;
                }
                const readProps = () => {
                    propsProxy.call('Get', new GLib.Variant('(ss)', [ADAPTER_IFACE, 'Powered']),
                        Gio.DBusCallFlags.NONE, -1, null, (proxy, callRes) => {
                            try {
                                const [variant] = proxy.call_finish(callRes).deep_unpack();
                                setPowered(variant.deep_unpack());
                            } catch (e) { logError(e, 'material-panel: bluez Get Powered failed'); }
                        });
                    propsProxy.call('Get', new GLib.Variant('(ss)', [ADAPTER_IFACE, 'Discovering']),
                        Gio.DBusCallFlags.NONE, -1, null, (proxy, callRes) => {
                            try {
                                const [variant] = proxy.call_finish(callRes).deep_unpack();
                                setDiscovering(variant.deep_unpack());
                            } catch (e) {}
                        });
                };
                readProps();
                if (propsSignalId) try { propsProxy.disconnect(propsSignalId); } catch (e) {}
                propsSignalId = propsProxy.connect('g-signal', (_p, _sender, signal, params) => {
                    if (signal !== 'PropertiesChanged') return;
                    const [iface, changed] = params.deep_unpack();
                    if (iface !== ADAPTER_IFACE) return;
                    if ('Powered' in changed) setPowered(changed['Powered'].deep_unpack());
                    if ('Discovering' in changed) setDiscovering(changed['Discovering'].deep_unpack());
                });
                // Trigger device refresh now that adapter exists
                if (_refreshDevices) _refreshDevices();
            });
    };

    let discoverAttempts = 0;
    const discover = () => {
        if (discoverAttempts > 6) return;
        discoverAttempts++;
        findAdapterPath(path => {
            if (!path) {
                if (isSoftBlocked()) setBlockedState();
                else setNoAdapterState();
                return;
            }
            discoverAttempts = 0;
            bindAdapter(path);
        });
    };

    // Device list: paired devices with connect/disconnect, like Noctalia
    // BluetoothPanel and quicksettings's buildBluetoothDeviceList but
    // embedded here so the chip has its own dropdown (not only QS tile).
    let objMgrProxy = null;
    let objMgrSignalId = 0;
    let _refreshDevices = null;
    let _needsRefresh = false;

    const buildDeviceRow = (path, props) => {
        const alias = props['Alias']?.deep_unpack() ?? null;
        const name = props['Name']?.deep_unpack() ?? null;
        const displayName = alias ?? name ?? 'Unknown device';
        const connected = props['Connected']?.deep_unpack() ?? false;
        const paired = props['Paired']?.deep_unpack() ?? false;
        const batteryPct = (() => {
            // Some adapters expose Battery percentage via Battery1; try generic
            try {
                if ('Battery' in props && props['Battery']) return props['Battery'].deep_unpack();
            } catch (e) {}
            return null;
        })();
        const row = new St.Button({
            style_class: `material-panel-bt-device${connected ? ' connected' : ''}${paired ? '' : ' unpaired'}`,
            reactive: true,
            x_expand: true,
        });
        const rowBox = new St.BoxLayout({x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'material-panel-bt-device-box'});
        // Icon: per-device type heuristic (End4 uses headset/keyboard icons)
        const iconName = connected ? 'bluetooth-on' : 'bluetooth-off';
        const gicon = Gio.FileIcon.new(Gio.File.new_for_path(
            connected ? iconPathOnAccent(iconName) : iconPathPrimary(iconName)));
        const devIcon = new St.Icon({style_class: 'material-panel-bt-device-icon', icon_size: 16, y_align: Clutter.ActorAlign.CENTER, gicon});
        const textBox = new St.BoxLayout({vertical: true, x_expand: true});
        const nameLabel = makeWrappingLabel(displayName, 'material-panel-bt-device-name');
        nameLabel.x_expand = true;
        const sub = batteryPct !== null
            ? `${connected ? 'Connected' : paired ? 'Paired' : 'Unpaired'} · ${batteryPct}%`
            : connected ? 'Connected — tap to disconnect' : paired ? 'Paired — tap to connect' : 'Tap to pair';
        const subLabel = new St.Label({text: sub, style_class: 'material-panel-bt-device-status', y_align: Clutter.ActorAlign.CENTER});
        subLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        textBox.add_child(nameLabel);
        textBox.add_child(subLabel);
        const actionIcon = new St.Icon({
            style_class: 'material-panel-bt-device-action',
            icon_name: connected ? 'media-playback-stop-symbolic' : 'system-run-symbolic',
            icon_size: 14,
            y_align: Clutter.ActorAlign.CENTER,
        });
        rowBox.add_child(devIcon);
        rowBox.add_child(textBox);
        rowBox.add_child(actionIcon);
        row.set_child(rowBox);
        row.connect('clicked', () => {
            const method = connected ? 'Disconnect' : 'Connect';
            Gio.DBusProxy.new_for_bus(
                Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
                BLUEZ_SERVICE, path, DEVICE_IFACE, null,
                (_s, res) => {
                    let deviceProxy;
                    try { deviceProxy = Gio.DBusProxy.new_for_bus_finish(res); } catch (e) { logError(e, `material-panel: bluez device proxy failed for "${displayName}"`); return; }
                    // If not paired yet, Pair first then Connect
                    if (!paired && method === 'Connect') {
                        deviceProxy.call('Pair', null, Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                            try { p.call_finish(r); } catch (e) { logError(e, `material-panel: bluez Pair failed for "${displayName}"`); return; }
                            deviceProxy.call('Connect', null, Gio.DBusCallFlags.NONE, -1, null, (p2, r2) => {
                                try { p2.call_finish(r2); } catch (e) { logError(e, `material-panel: bluez Connect failed for "${displayName}"`); }
                            });
                        });
                        return;
                    }
                    deviceProxy.call(method, null, Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                        try { p.call_finish(r); } catch (e) { logError(e, `material-panel: bluez ${method} failed for "${displayName}"`); }
                    });
                });
            // Don't close menu — stay open like Noctalia/End4 so user sees result
            return Clutter.EVENT_STOP;
        });
        return row;
    };

    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
        BLUEZ_SERVICE, '/', OBJECT_MANAGER_IFACE, null,
        (_s, res) => {
            try { objMgrProxy = Gio.DBusProxy.new_for_bus_finish(res); } catch (e) { logError(e, 'material-panel: bluez unavailable, bluetooth device list stays empty'); return; }
            const refresh = () => {
                if (!objMgrProxy) return;
                objMgrProxy.call('GetManagedObjects', null, Gio.DBusCallFlags.NONE, -1, null, (proxy, callRes) => {
                    try {
                        const [objects] = proxy.call_finish(callRes).deep_unpack();
                        const hasAdapter = Object.values(objects).some(ifaces => ADAPTER_IFACE in ifaces);
                        if (!hasAdapter) {
                            try {
                                const [ok, out] = GLib.spawn_command_line_sync('rfkill list bluetooth');
                                const blocked = ok && out && new TextDecoder('utf-8').decode(out).includes('Soft blocked: yes');
                                if (blocked) {
                                    setBlockedState();
                                    devicesBox.destroy_all_children();
                                    const hint = new St.Label({text: 'Blocked — use switch above to unblock', style_class: 'material-panel-bt-device-status'});
                                    hint.style = 'font-style: italic; padding: 4px 8px;';
                                    devicesBox.add_child(hint);
                                    devicesHeaderCount.text = '';
                                    return;
                                }
                            } catch (e) {}
                            devicesBox.destroy_all_children();
                            const hint = new St.Label({text: 'No adapter', style_class: 'material-panel-bt-device-status'});
                            hint.style = 'font-style: italic; padding: 4px 8px;';
                            devicesBox.add_child(hint);
                            devicesHeaderCount.text = '';
                            return;
                        }
                        if (!currentlyPowered) {
                            devicesBox.destroy_all_children();
                            const hint = new St.Label({text: 'Bluetooth off — turn on to see devices', style_class: 'material-panel-bt-device-status'});
                            hint.style = 'font-style: italic; padding: 4px 8px;';
                            devicesBox.add_child(hint);
                            devicesHeaderCount.text = '';
                            return;
                        }
                        const pairedDevices = Object.entries(objects)
                            .filter(([, ifaces]) => DEVICE_IFACE in ifaces)
                            .map(([path, ifaces]) => ({path, props: ifaces[DEVICE_IFACE]}))
                            .filter(({props}) => props['Paired']?.deep_unpack());
                        // Show paired first, connected at top (Noctalia order)
                        pairedDevices.sort((a, b) => {
                            const ac = a.props['Connected']?.deep_unpack() ? 0 : 1;
                            const bc = b.props['Connected']?.deep_unpack() ? 0 : 1;
                            return ac - bc;
                        });
                        devicesBox.destroy_all_children();
                        devicesHeaderCount.text = `(${pairedDevices.length})`;
                        if (pairedDevices.length === 0) {
                            const hint = new St.Label({text: 'No paired devices — pair in Settings', style_class: 'material-panel-bt-device-status'});
                            hint.style = 'font-style: italic; padding: 4px 8px;';
                            devicesBox.add_child(hint);
                            return;
                        }
                        for (const {path, props} of pairedDevices)
                            devicesBox.add_child(buildDeviceRow(path, props));
                        // Also show unpaired nearby if discovering (End4 style: nearby section)
                        if (discovering) {
                            const nearby = Object.entries(objects)
                                .filter(([, ifaces]) => DEVICE_IFACE in ifaces)
                                .map(([path, ifaces]) => ({path, props: ifaces[DEVICE_IFACE]}))
                                .filter(({props}) => !props['Paired']?.deep_unpack() && props['Name']?.deep_unpack());
                            if (nearby.length > 0) {
                                const sep = new St.Label({text: 'Nearby', style_class: 'material-panel-bt-nearby-header'});
                                sep.style = 'font-size: 10px; opacity: 0.6; padding: 6px 8px 2px 8px;';
                                devicesBox.add_child(sep);
                                for (const {path, props} of nearby.slice(0, 6))
                                    devicesBox.add_child(buildDeviceRow(path, props));
                            }
                        }
                    } catch (e) { logError(e, 'material-panel: bluez GetManagedObjects failed for bluetooth dropdown'); }
                });
            };
            _refreshDevices = refresh;
            refresh();
            objMgrSignalId = objMgrProxy.connect('g-signal', (_p, _sender, signal, params) => {
                if (signal === 'InterfacesAdded' || signal === 'InterfacesRemoved' || signal === 'PropertiesChanged')
                    refresh();
            });
            devicesBox.connect('destroy', () => {
                if (objMgrProxy && objMgrSignalId) try { objMgrProxy.disconnect(objMgrSignalId); } catch (e) {}
            });
            menu.actor.connect('destroy', () => {
                try { if (objMgrProxy && objMgrSignalId) objMgrProxy.disconnect(objMgrSignalId); } catch (e) {}
            });
            // Refresh on menu open — ensures fresh list after rfkill unblock
            menu.connect('open-state-changed', (_m, open) => {
                if (open) refresh();
            });
        });

    // Button toggles popup (like network), not direct power toggle —
    // power is now the switch inside the popup (Noctalia/End4 header).
    // Keep quick toggle on right-click or middle?
    button.connect('clicked', () => {
        if (menu.isOpen) menu.close();
        else menu.open();
        return Clutter.EVENT_STOP;
    });
    // Right-click quick toggle power (alternative fast path)
    button.connect('button-press-event', (_a, event) => {
        if (event.get_button() === 3) { // right click
            if (isBlocked) {
                try { GLib.spawn_command_line_async('rfkill unblock bluetooth'); } catch (e) {}
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => { discover(); return GLib.SOURCE_REMOVE; });
                return Clutter.EVENT_STOP;
            }
            if (propsProxy) {
                propsProxy.call('Set', new GLib.Variant('(ssv)', [ADAPTER_IFACE, 'Powered', new GLib.Variant('b', !currentlyPowered)]),
                    Gio.DBusCallFlags.NONE, -1, null, (p, r) => { try { p.call_finish(r); } catch (e) {} });
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    });

    discover();

    button.connect('destroy', () => {
        if (propsProxy && propsSignalId) try { propsProxy.disconnect(propsSignalId); } catch (e) {}
        menu.destroy();
    });

    return button;
}
