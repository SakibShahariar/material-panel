import {setChipA11y} from '../lib/a11y.js';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';

import {iconPath, iconPathOnAccent, iconPathPrimary} from '../lib/iconTheme.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';
import {codecFromPactlText} from '../lib/bluetoothCodec.js';
import {makeWrappingLabel, wrapAsMenuItem} from '../lib/bluetoothUi.js';
import {getBluetoothDevices} from '../lib/bluetoothDevices.js';
import {runBluetoothDeviceAction} from '../lib/bluetoothActions.js';
import {checkBluetoothSoftBlocked} from '../lib/bluetoothRfkill.js';
import {getBluetoothDeviceIcon} from '../lib/bluetoothDevice.js';

const BLUEZ_SERVICE = 'org.bluez';
const OBJECT_MANAGER_IFACE = 'org.freedesktop.DBus.ObjectManager';
const ADAPTER_IFACE = 'org.bluez.Adapter1';
const DEVICE_IFACE = 'org.bluez.Device1';
const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties';

/**
 * Map BlueZ Icon / Class to a panel icon key (Material Symbols style names we ship).
 * Falls back to generic bluetooth-on/off.
 */
function resolveDeviceGicon(key, connected) {
    const candidates = [
        connected ? iconPathOnAccent(key) : iconPathPrimary(key),
        iconPathPrimary(key),
        iconPath(key),
        connected ? iconPathOnAccent('bluetooth-on') : iconPathPrimary('bluetooth-off'),
        iconPath('bluetooth-on'),
    ];
    for (const pth of candidates) {
        try {
            if (pth && Gio.File.new_for_path(pth).query_exists(null))
                return Gio.FileIcon.new(Gio.File.new_for_path(pth));
        } catch (e) {}
    }
    const themedFallbacks = {
        mouse: 'input-mouse-symbolic',
        gamepad: 'input-gaming-symbolic',
        keyboard: 'input-keyboard-symbolic',
        headphones: 'audio-headphones-symbolic',
        phone: 'phone-symbolic',
        computer: 'computer-symbolic',
    };
    if (themedFallbacks[key])
        return Gio.ThemedIcon.new(themedFallbacks[key]);
    return Gio.ThemedIcon.new(
        connected ? 'bluetooth-active-symbolic' : 'bluetooth-disabled-symbolic');
}


function spawnCaptureAsync(argv) {
    return new Promise((resolve, reject) => {
        try {
            const proc = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout, stderr] = p.communicate_utf8_finish(res);
                    if (!p.get_successful())
                        reject(new Error(stderr || 'command failed'));
                    else
                        resolve(stdout || '');
                } catch (e) {
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

const CODEC_CACHE_TTL_MS = 15000;
const PACTL_SNAPSHOT_TTL_MS = 5000;
const codecCache = new Map();
let pactlSnapshot = null;
let pactlSnapshotAt = 0;
let pactlSnapshotPromise = null;

function loadPactlCardsSnapshot() {
    const now = Date.now();
    if (pactlSnapshot !== null && now - pactlSnapshotAt < PACTL_SNAPSHOT_TTL_MS)
        return Promise.resolve(pactlSnapshot);
    if (pactlSnapshotPromise)
        return pactlSnapshotPromise;
    pactlSnapshotPromise = spawnCaptureAsync(['env', 'LC_ALL=C', 'pactl', 'list', 'cards'])
        .then(text => {
            pactlSnapshot = text;
            pactlSnapshotAt = Date.now();
            return text;
        })
        .finally(() => {
            pactlSnapshotPromise = null;
        });
    return pactlSnapshotPromise;
}

function probeBluetoothCodecAsync(deviceAddress) {
    const address = String(deviceAddress ?? '').trim();
    if (!address)
        return Promise.resolve(null);
    const now = Date.now();
    const cached = codecCache.get(address);
    if (cached && now < cached.expiresAt)
        return Promise.resolve(cached.codec);
    return loadPactlCardsSnapshot()
        .then(text => {
            const codec = codecFromPactlText(text, address);
            codecCache.set(address, {codec, expiresAt: Date.now() + CODEC_CACHE_TTL_MS});
            return codec;
        })
        .catch(() => {
            // Cache failed probes briefly too, avoiding a process storm when
            // pactl is absent or the audio service is not ready.
            codecCache.set(address, {codec: null, expiresAt: Date.now() + CODEC_CACHE_TTL_MS});
            return null;
        });
}


// Timeout for DBus calls (ms) - prevents hanging if bluetoothd is unresponsive
const DBUS_TIMEOUT_MS = 3000;

function findAdapterPaths(callback, cancellable = null) {
    let timedOut = false;
    const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DBUS_TIMEOUT_MS, () => {
        timedOut = true;
        callback([], new Error('BlueZ service request timed out'));
        return GLib.SOURCE_REMOVE;
    });

    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
        BLUEZ_SERVICE, '/', OBJECT_MANAGER_IFACE, cancellable,
        (_src, res) => {
            if (timedOut) return;
            try { GLib.source_remove(timeoutId); } catch (e) {}
            if (cancellable?.is_cancelled?.()) {
                callback([]);
                return;
            }

            let objMgr;
            try {
                objMgr = Gio.DBusProxy.new_for_bus_finish(res);
            } catch (e) {
                if (!e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    logError(e, 'material-panel: bluez unavailable (is bluetoothd running?)');
                    callback([], e);
                } else {
                    callback([]);
                }
                return;
            }
            objMgr.call(
                'GetManagedObjects', null, Gio.DBusCallFlags.NONE, DBUS_TIMEOUT_MS, cancellable,
                (proxy, callRes) => {
                    if (timedOut) return;
                    try {
                        const result = proxy.call_finish(callRes);
                        const [objects] = result.deep_unpack();
                        const adapters = Object.keys(objects)
                            .filter(path => ADAPTER_IFACE in objects[path])
                            .map(path => {
                                const props = objects[path][ADAPTER_IFACE] || {};
                                const unpack = key => {
                                    try { return props[key]?.deep_unpack?.() ?? props[key] ?? null; }
                                    catch (e) { return null; }
                                };
                                const alias = unpack('Alias');
                                const address = unpack('Address');
                                return {path, name: String(alias || address || path.split('/').pop() || path), powered: unpack('Powered') === true};
                            })
                            .sort((a, b) => Number(b.powered) - Number(a.powered));
                        callback(adapters);
                    } catch (e) {
                        logError(e, 'material-panel: bluez GetManagedObjects failed');
                        callback([], e);
                    }
                });
        });
}





// Modern bluetooth popup — inspired by Noctalia v5 Control Center and
// End4 illogical-impulse Quickshell sidebar: header with power toggle +
// blocked/unblock state, paired-device list with per-device
// connect/disconnect, battery where exposed, live refresh via
// ObjectManager InterfacesAdded/Removed and per-device PropertiesChanged.

/** Shared opener so btConnected (headphones chip) can open the same popup. */
let _btPopupMenu = null;
let _btPopupButton = null;

function clearSharedBluetoothPopup(menu, button) {
    if (_btPopupMenu === menu)
        _btPopupMenu = null;
    if (_btPopupButton === button)
        _btPopupButton = null;
}

function sharedBluetoothPopupIsAlive() {
    const menu = _btPopupMenu;
    if (!menu)
        return false;
    try {
        if (menu.actor?.actor_destroyed || _btPopupButton?.actor_destroyed) {
            clearSharedBluetoothPopup(menu, _btPopupButton);
            return false;
        }
        menu.actor?.get_parent?.();
        return true;
    } catch (e) {
        clearSharedBluetoothPopup(menu, _btPopupButton);
        return false;
    }
}

export function toggleBluetoothPopup(sourceActor = null) {
    if (!sharedBluetoothPopupIsAlive()) {
        log('material-panel: bluetooth popup not ready — build Bluetooth module or wait for ensure');
        return false;
    }
    const menu = _btPopupMenu;
    try {
        if (menu.isOpen) {
            menuClose(menu);
            return true;
        }
        if (sourceActor)
            menu.sourceActor = sourceActor;
        else if (_btPopupButton)
            menu.sourceActor = _btPopupButton;
        menuOpen(menu);
        return true;
    } catch (e) {
        logError(e, 'material-panel: toggleBluetoothPopup');
        return false;
    }
}

/** True only while the shared popup still belongs to a live Bluetooth chip. */
export function isBluetoothPopupReady() {
    return sharedBluetoothPopupIsAlive();
}

export function buildBluetooth(_extensionPath, scale = 1.0) {
    const cancellable = new Gio.Cancellable();
    const buttonBox = new St.BoxLayout({orientation: Clutter.Orientation.HORIZONTAL, y_align: Clutter.ActorAlign.CENTER, style_class: 'material-panel-bt-chip-box'});
    const icon = new St.Icon({
        style_class: 'material-panel-bluetooth-icon',
        icon_size: Math.round(17 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off'))),
    });
    const dropArrow = new St.Icon({
        style_class: 'material-panel-bt-chip-arrow',
        icon_name: 'pan-down-symbolic',
        icon_size: Math.round(10 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        style: `opacity: 0.7; margin-left: ${Math.round(3 * (scale || 1.0))}px; padding-left: ${Math.round(4 * (scale || 1.0))}px; border-left: 1px solid rgba(255,255,255,0.15);`,
    });
    const chipBatt = new St.Label({
        text: '',
        style_class: 'material-panel-bt-chip-batt',
        y_align: Clutter.ActorAlign.CENTER,
    });
    chipBatt.visible = false;
    buttonBox.add_child(icon);
    buttonBox.add_child(chipBatt);
    buttonBox.add_child(dropArrow);
    const button = new St.Button({
        style_class: 'material-panel-bluetooth-btn material-panel-chip',
        reactive: true,
        child: buttonBox,
    });

    setChipA11y(button, 'Bluetooth, status unavailable');
    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    _btPopupMenu = menu;
    _btPopupButton = button;
    const clearThisPopup = () => clearSharedBluetoothPopup(menu, button);
    menu.actor.connect('destroy', clearThisPopup);
    button.connect('destroy', clearThisPopup);

    menu.actor.add_style_class_name('material-panel-popup material-panel-bluetooth-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);
    menu.connect('open-state-changed', (_m, open) => {
        dropArrow.icon_name = open ? 'pan-up-symbolic' : 'pan-down-symbolic';
    });

    let propsProxy = null;
    let adapterPath = null;
    let propsSignalId = 0;
    let currentlyPowered = false;
    let isBlocked = false;
    let discovering = false;
    let destroyed = false;
    let rfkillRetryId = 0;
    let rfkillResetId = 0;
    let contextRetryId = 0;
    let preferredAdapterPath = null;
    let adapterMenuItems = [];

    // Header — Bluetooth power switch and adapter chooser.
    const btSwitch = new PopupMenu.PopupSwitchMenuItem('Bluetooth', false);
    const adapterMenu = new PopupMenu.PopupSubMenuMenuItem('Bluetooth adapter', false);
    adapterMenu.visible = false;
    const refreshAdapterMenu = adapters => {
        for (const item of adapterMenuItems) {
            try { adapterMenu.menu.removeMenuItem(item); } catch (e) {}
        }
        adapterMenuItems = [];
        adapterMenu.visible = adapters.length > 1;
        for (const adapter of adapters) {
            const label = (adapter.path === adapterPath ? '✓ ' : '') + adapter.name;
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => {
                preferredAdapterPath = adapter.path;
                bindAdapter(adapter.path);
                refreshAdapterMenu(adapters);
            });
            adapterMenu.menu.addMenuItem(item);
            adapterMenuItems.push(item);
        }
    };
    // Replace switch's icon row styling to match Noctalia header: keep switch widget
    btSwitch.connect('toggled', () => {
        if (isBlocked) {
            try {
                GLib.spawn_command_line_async('rfkill unblock bluetooth');
                log('material-panel: rfkill unblock bluetooth requested (header switch)');
                btSwitch.label.text = 'Unblocking…';
                rfkillRetryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                    rfkillRetryId = 0;
                    if (!destroyed)
                        discover();
                    return GLib.SOURCE_REMOVE;
                });
            } catch (e) { logError(e, 'material-panel: rfkill unblock failed'); }
            // revert visual until rediscover
            rfkillResetId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                rfkillResetId = 0;
                if (!destroyed)
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
    const devicesOuter = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'material-panel-bt-outer'});
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
    // Use CSS max-height (.material-panel-bt-scroll { max-height: 260px }) not inline style, and ensure scroll is constrained
    const devicesBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'material-panel-bt-devices', style: 'min-width: 280px;'});
    scroll.set_child(devicesBox);
    devicesOuter.add_child(scroll);
    const devicesOuterItem = wrapAsMenuItem(devicesOuter);
    // Ensure popup menu has reasonable width so device rows don't stretch unbounded
    try { menu.actor.style = 'max-width: 360px; min-width: 260px;'; } catch (e) {}

    // Footer — open Settings shortcut (like Noctalia's "Open Bluetooth Settings")
    const footerBtn = new St.Button({
        style_class: 'material-panel-bt-footer-btn',
        reactive: true,
        x_expand: true,
        child: new St.Label({text: 'Open Bluetooth Settings…', style_class: 'material-panel-bt-footer-label'}),
    });
    setChipA11y(footerBtn, 'Open Bluetooth Settings');
    footerBtn.connect('clicked', () => {
        try { GLib.spawn_command_line_async('gnome-control-center bluetooth'); }
        catch (e) { logError(e, 'material-panel: failed to open Bluetooth settings'); }
        menuClose(menu);
    });
    const footerItem = wrapAsMenuItem(footerBtn);

    menu.addMenuItem(btSwitch);
    menu.addMenuItem(adapterMenu);
    menu.addMenuItem(blockedItem);
    menu.addMenuItem(scanSwitch);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    menu.addMenuItem(devicesOuterItem);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    menu.addMenuItem(footerItem);

    const setPowered = powered => {
        currentlyPowered = powered;
        isBlocked = false;
        setChipA11y(button, `Bluetooth, ${powered ? 'on' : 'off'}`);
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
        setChipA11y(button, 'Bluetooth, blocked');
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
        setChipA11y(button, 'Bluetooth, no adapter');
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off')));
        button.set_style_class_name('material-panel-bluetooth-btn material-panel-chip');
        btSwitch.setToggleState(false);
        btSwitch.label.text = 'Bluetooth — No adapter';
        blockedHint.visible = false;
        scanSwitch.visible = false;
        devicesHeaderLabel.text = 'Paired devices — no adapter';
        devicesOuter.opacity = 90;
    };

    const setBluezUnavailableState = () => {
        isBlocked = false;
        setChipA11y(button, 'Bluetooth, unavailable');
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off')));
        button.set_style_class_name('material-panel-bluetooth-btn material-panel-chip');
        btSwitch.setToggleState(false);
        btSwitch.label.text = 'Bluetooth — Unavailable';
        blockedHint.visible = false;
        scanSwitch.visible = false;
        devicesHeaderLabel.text = 'Paired devices — BlueZ unavailable';
        devicesOuter.opacity = 90;
    };

    const bindAdapter = path => {
        if (propsProxy && propsSignalId) {
            try { propsProxy.disconnect(propsSignalId); } catch (e) {}
            propsSignalId = 0;
        }
        adapterPath = path;
        preferredAdapterPath = path;
        let timedOut = false;
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DBUS_TIMEOUT_MS, () => {
            timedOut = true;
            setNoAdapterState();
            return GLib.SOURCE_REMOVE;
        });

        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            BLUEZ_SERVICE, path, PROPERTIES_IFACE, null,
            (_src, res) => {
                if (timedOut) return;
                GLib.source_remove(timeoutId);
                try {
                    propsProxy = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    logError(e, 'material-panel: bluez properties proxy failed');
                    setNoAdapterState();
                    return;
                }
                const readProps = () => {
                    propsProxy.call('Get', new GLib.Variant('(ss)', [ADAPTER_IFACE, 'Powered']),
                        Gio.DBusCallFlags.NONE, DBUS_TIMEOUT_MS, null, (proxy, callRes) => {
                            try {
                                const [variant] = proxy.call_finish(callRes).deep_unpack();
                                setPowered(variant.deep_unpack());
                            } catch (e) { logError(e, 'material-panel: bluez Get Powered failed'); }
                        });
                    propsProxy.call('Get', new GLib.Variant('(ss)', [ADAPTER_IFACE, 'Discovering']),
                        Gio.DBusCallFlags.NONE, DBUS_TIMEOUT_MS, null, (proxy, callRes) => {
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
        findAdapterPaths((adapters, error = null) => {
            refreshAdapterMenu(adapters);
            if (error) {
                discoverAttempts = 0;
                setBluezUnavailableState();
                return;
            }
            if (!adapters.length) {
                checkBluetoothSoftBlocked(blocked => {
                    if (blocked) setBlockedState();
                    else setNoAdapterState();
                });
                return;
            }
            discoverAttempts = 0;
            const selected = adapters.find(adapter => adapter.path === preferredAdapterPath) ||
                adapters.find(adapter => adapter.path === adapterPath) ||
                adapters.find(adapter => adapter.powered) || adapters[0];
            if (selected.path !== adapterPath || !propsProxy)
                bindAdapter(selected.path);
        });
    };

    // Device list: paired devices with connect/disconnect, like Noctalia
    // BluetoothPanel and quicksettings's buildBluetoothDeviceList but
    // embedded here so the chip has its own dropdown (not only QS tile).
    let objMgrProxy = null;
    let objMgrSignalId = 0;
    let _refreshDevices = null;
    let _needsRefresh = false;

    const buildDeviceRow = (path, props, batteryPct = null) => {
        const alias = props['Alias']?.deep_unpack() ?? null;
        const name = props['Name']?.deep_unpack() ?? null;
        const displayName = alias ?? name ?? 'Unknown device';
        const connected = props['Connected']?.deep_unpack() ?? false;
        const paired = props['Paired']?.deep_unpack() ?? false;
        let connecting = false;
        try {
            connecting = !!(props['Connecting']?.deep_unpack?.() ?? false);
        } catch (e) {}
        if (batteryPct == null) {
            try {
                if ('Battery' in props && props['Battery'])
                    batteryPct = props['Battery'].deep_unpack();
            } catch (e) {}
        }
        const row = new St.Button({
            style_class: `material-panel-bt-device${connected ? ' connected' : ''}${connecting ? ' connecting' : ''}${paired ? '' : ' unpaired'}`,
            reactive: true,
            track_hover: true,
            x_expand: true,
        });
        const rowBox = new St.BoxLayout({x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'material-panel-bt-device-box'});
        // Icon by BlueZ type (Omarchy-style device glyphs)
        const iconKey = getBluetoothDeviceIcon(props, connected || connecting);
        const gicon = resolveDeviceGicon(iconKey, connected);
        const devIcon = new St.Icon({
            style_class: 'material-panel-bt-device-icon',
            icon_size: 18,
            y_align: Clutter.ActorAlign.CENTER,
            gicon,
        });
        const textBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const nameLabel = makeWrappingLabel(displayName, 'material-panel-bt-device-name');
        nameLabel.x_expand = true;
        const parts = [];
        if (connecting)
            parts.push('Connecting…');
        else if (connected)
            parts.push('Connected');
        else if (paired)
            parts.push('Paired');
        else
            parts.push('Available');
        if (batteryPct !== null)
            parts.push(`${batteryPct}%`);
        if (!connecting && !connected && paired)
            parts.push('tap to connect');
        else if (connected)
            parts.push('tap to disconnect');
        const subLabel = new St.Label({text: parts.join(' · '), style_class: 'material-panel-bt-device-status', y_align: Clutter.ActorAlign.CENTER});
        if (connected) {
            probeBluetoothCodecAsync(props['Address']?.deep_unpack?.() ?? props['Address']).then(codec => {
                if (!codec)
                    return;
                try {
                    const base = parts.filter(p => p !== codec);
                    if (!base.includes(codec))
                        base.splice(Math.min(2, base.length), 0, codec);
                    subLabel.text = base.join(' · ');
                } catch (e) {}
            }).catch(() => {});
        }
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
        setChipA11y(row, [displayName, ...parts].join(', '));
        row.connect('clicked', () => {
            const action = connected ? 'Disconnect' : 'Connect';
            runBluetoothDeviceAction({
                path, paired, connected, timeoutMs: DBUS_TIMEOUT_MS, cancellable,
            }, (error, completedAction) => {
                if (!error)
                    return;
                logError(error, `material-panel: bluez ${completedAction} failed for "${displayName}"`);
                const message = error.message || 'try again';
                subLabel.text = !paired && action === 'Connect'
                    ? `Pairing or connection failed: ${message}`
                    : `${completedAction} failed: ${message}`;
            });
            // Don't close menu — stay open like Noctalia/End4 so user sees result.
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
                objMgrProxy.call('GetManagedObjects', null, Gio.DBusCallFlags.NONE, DBUS_TIMEOUT_MS, cancellable, (proxy, callRes) => {
                    try {
                        const [objects] = proxy.call_finish(callRes).deep_unpack();
                        const hasAdapter = Object.values(objects).some(ifaces => ADAPTER_IFACE in ifaces);
                        if (!hasAdapter) {
                            isSoftBlocked(blocked => {
                                if (blocked) {
                                    setBlockedState();
                                    devicesBox.destroy_all_children();
                                    const hint = new St.Label({text: 'Blocked — use switch above to unblock', style_class: 'material-panel-bt-device-status material-panel-bt-device-hint'});
                                    devicesBox.add_child(hint);
                                    devicesHeaderCount.text = '';
                                    return;
                                }
                                devicesBox.destroy_all_children();
                                const hint = new St.Label({text: 'No adapter', style_class: 'material-panel-bt-device-status material-panel-bt-device-hint'});
                                devicesBox.add_child(hint);
                                devicesHeaderCount.text = '';
                            });
                            return;
                        }
                        if (!currentlyPowered) {
                            devicesBox.destroy_all_children();
                            const hint = new St.Label({text: 'Bluetooth off — turn on to see devices', style_class: 'material-panel-bt-device-status material-panel-bt-device-hint'});
                            devicesBox.add_child(hint);
                            devicesHeaderCount.text = '';
                            return;
                        }
                        const {pairedDevices, nearbyDevices} = getBluetoothDevices(objects);
                        devicesBox.destroy_all_children();
                        devicesHeaderCount.text = `(${pairedDevices.length})`;
                        if (pairedDevices.length === 0) {
                            const hint = new St.Label({text: 'No paired devices — pair in Settings', style_class: 'material-panel-bt-device-status material-panel-bt-device-hint'});
                            devicesBox.add_child(hint);
                            return;
                        }
                        for (const {path, props, batteryPct} of pairedDevices)
                            devicesBox.add_child(buildDeviceRow(path, props, batteryPct));
                        try {
                            let shown = false;
                            for (const {props, batteryPct} of pairedDevices) {
                                const connected = props['Connected']?.deep_unpack() ?? false;
                                const pct = batteryPct;
                                if (connected && pct != null && pct !== undefined) {
                                    chipBatt.text = `${Math.round(Number(pct))}%`;
                                    chipBatt.visible = true;
                                    shown = true;
                                    break;
                                }
                            }
                            if (!shown) {
                                chipBatt.text = '';
                                chipBatt.visible = false;
                            }
                        } catch (e) {}
                        // Also show unpaired nearby if discovering (End4 style: nearby section)
                        if (discovering) {
                            if (nearbyDevices.length > 0) {
                                const sep = new St.Label({text: 'Nearby', style_class: 'material-panel-bt-nearby-header'});
                                devicesBox.add_child(sep);
                                for (const {path, props, batteryPct} of nearbyDevices.slice(0, 6))
                                    devicesBox.add_child(buildDeviceRow(path, props, batteryPct));
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
        if (menu.isOpen) menuClose(menu);
        else menuOpen(menu);
        return Clutter.EVENT_STOP;
    });
    // Right-click quick toggle power (alternative fast path)
    button.connect('button-press-event', (_a, event) => {
        if (event.get_button() === 3) { // right click
            if (isBlocked) {
                try { GLib.spawn_command_line_async('rfkill unblock bluetooth'); }
                catch (e) { logError(e, 'material-panel: rfkill unblock failed from context menu'); }
                contextRetryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                    contextRetryId = 0;
                    if (!destroyed)
                        discover();
                    return GLib.SOURCE_REMOVE;
                });
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
        clearThisPopup();
        destroyed = true;
        for (const id of [rfkillRetryId, rfkillResetId, contextRetryId]) {
            if (id) {
                try { GLib.source_remove(id); } catch (e) {}
            }
        }
        rfkillRetryId = 0;
        rfkillResetId = 0;
        contextRetryId = 0;
        try { cancellable.cancel(); } catch (e) {}
        if (propsProxy && propsSignalId) try { propsProxy.disconnect(propsSignalId); } catch (e) {}
        menu.destroy();
    });

    try { setChipA11y(button, 'Bluetooth'); } catch (e) {}
    return button;
}
