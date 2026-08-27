import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {iconPath} from '../lib/iconTheme.js';

const BLUEZ_SERVICE = 'org.bluez';
const OBJECT_MANAGER_IFACE = 'org.freedesktop.DBus.ObjectManager';
const ADAPTER_IFACE = 'org.bluez.Adapter1';
const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties';

// BlueZ adapter object paths aren't fixed (hci0 is common but not
// guaranteed), so we discover the first available adapter via the standard
// ObjectManager pattern rather than hardcoding a path.
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

export function buildBluetooth() {
    const button = new St.Button({
        style_class: 'material-panel-bluetooth-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            style_class: 'material-panel-bluetooth-icon',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off'))),
        }),
    });
    const icon = button.get_child();

    let propsProxy = null;
    let signalId = 0;
    let currentlyPowered = false;
    let isBlocked = false;
    let clickId = 0;

    const setPowered = powered => {
        currentlyPowered = powered;
        isBlocked = false;
        icon.gicon = Gio.FileIcon.new(
            Gio.File.new_for_path(iconPath(powered ? 'bluetooth-on' : 'bluetooth-off')));
        button.set_style_class_name(
            `material-panel-bluetooth-btn material-panel-chip${powered ? ' active' : ''}`);
        button.reactive = true;
    };

    const setBlockedState = () => {
        isBlocked = true;
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off')));
        button.set_style_class_name('material-panel-bluetooth-btn material-panel-chip');
        button.reactive = true;
        log('material-panel: bluetooth chip — rfkill soft blocked, tap to unblock');
    };

    const setNoAdapterState = () => {
        isBlocked = false;
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off')));
        button.set_style_class_name('material-panel-bluetooth-btn material-panel-chip');
        // keep reactive to allow retry on click
        button.reactive = true;
    };

    const bindAdapter = path => {
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

                const readPowered = () => {
                    propsProxy.call(
                        'Get', new GLib.Variant('(ss)', [ADAPTER_IFACE, 'Powered']),
                        Gio.DBusCallFlags.NONE, -1, null,
                        (proxy, callRes) => {
                            try {
                                const result = proxy.call_finish(callRes);
                                const [variant] = result.deep_unpack();
                                setPowered(variant.deep_unpack());
                            } catch (e) {
                                logError(e, 'material-panel: bluez Get Powered failed');
                            }
                        });
                };
                readPowered();

                signalId = propsProxy.connect('g-signal', (_p, _sender, signal, params) => {
                    if (signal !== 'PropertiesChanged')
                        return;
                    const [iface, changed] = params.deep_unpack();
                    if (iface === ADAPTER_IFACE && 'Powered' in changed)
                        setPowered(changed['Powered'].deep_unpack());
                });
            });
    };

    const discover = () => {
        findAdapterPath(path => {
            if (!path) {
                if (isSoftBlocked()) setBlockedState();
                else setNoAdapterState();
                return;
            }
            bindAdapter(path);
        });
    };

    clickId = button.connect('clicked', () => {
        if (isBlocked) {
            try {
                GLib.spawn_command_line_async('rfkill unblock bluetooth');
                log('material-panel: rfkill unblock bluetooth requested (chip)');
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                    discover();
                    return GLib.SOURCE_REMOVE;
                });
            } catch (e) {
                logError(e, 'material-panel: rfkill unblock failed');
            }
            return;
        }
        if (!propsProxy) {
            discover();
            return;
        }
        propsProxy.call(
            'Set', new GLib.Variant('(ssv)',
                [ADAPTER_IFACE, 'Powered', new GLib.Variant('b', !currentlyPowered)]),
            Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                try { p.call_finish(r); } catch (e) { logError(e, 'material-panel: bluez Set Powered failed'); }
            });
    });

    discover();

    button.connect('destroy', () => {
        if (propsProxy && signalId)
            propsProxy.disconnect(signalId);
    });

    return button;
}
