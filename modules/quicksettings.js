import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Gvc from 'gi://Gvc';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createSlider} from '../lib/simpleSlider.js';
import {getMixerControl} from '../lib/audio.js';
import {buildProfileCard} from './profileCard.js';
import {buildMediaPlayerRow} from './mediaPlayer.js';

import {iconPath, iconPathOnAccent, iconPathPrimary} from '../lib/iconTheme.js';

// A real quick-settings panel: one button in the bar opens a small floating
// grid of toggle tiles, like Windows/macOS Control Center or GNOME's own
// Quick Settings - not separate chips scattered across the bar.

function makeWrappingLabel(text, styleClass) {
    const label = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    // Longer labels ("Do not disturb") don't fit a compact tile on one
    // line - wrap instead of the default single-line ellipsis truncation.
    label.clutter_text.line_wrap = true;
    label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    return label;
}

function buildTile({iconKey, label, isOn, onToggle, watch}) {
    const tile = new St.Button({
        style_class: 'material-panel-qs-tile',
        reactive: true,
        x_expand: true,
    });
    const box = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-qs-tile-content',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const icon = new St.Icon({
        style_class: 'material-panel-qs-tile-icon',
        icon_size: 18,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath(iconKey))),
    });
    const text = makeWrappingLabel(label, 'material-panel-qs-tile-label');
    text.x_expand = true;
    box.add_child(icon);
    box.add_child(text);
    tile.set_child(box);

    const refresh = () => {
        const on = isOn();
        tile.set_style_class_name(`material-panel-qs-tile${on ? ' active' : ''}`);
        icon.gicon = Gio.FileIcon.new(
            Gio.File.new_for_path(on ? iconPathOnAccent(iconKey) : iconPath(iconKey)));
    };
    refresh();

    tile.connect('clicked', () => {
        onToggle();
        refresh();
    });

    if (watch) {
        const disconnect = watch(refresh);
        tile.connect('destroy', disconnect);
    }

    return tile;
}

function wrapAsMenuItem(actor) {
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(actor);
    return item;
}

// Uses GNOME Shell's own Slider actor (same one the stock quick settings
// menu uses) rather than building a custom drag widget from scratch.
function volumeSliderRow() {
    const row = new St.BoxLayout({style_class: 'material-panel-qs-slider-row', x_expand: true});
    const icon = new St.Icon({
        style_class: 'material-panel-qs-slider-icon',
        icon_size: 18,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('volume-high'))),
    });
    row.add_child(icon);

    let control, sink;
    let sinkVolumeId = 0;
    let sinkMuteId = 0;
    let controlStateId = 0;
    let controlDefaultSinkId = 0;
    let lastIconKey = 'volume-high';

    const iconKeyFor = pct => {
        if (pct === 0) return 'volume-muted';
        if (pct >= 66) return 'volume-high';
        if (pct >= 33) return 'volume-medium';
        return 'volume-low';
    };

    // Only reassign gicon (allocates a new GFile/GIcon and triggers a
    // texture reload) when the icon actually needs to change, not on
    // every single motion-event during a drag - that churn was the main
    // cause of visibly laggy dragging.
    const updateIconIfChanged = pct => {
        const key = iconKeyFor(pct);
        if (key !== lastIconKey) {
            lastIconKey = key;
            icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath(key)));
        }
    };

    const pctLabel = new St.Label({
        text: '0%',
        style_class: 'material-panel-qs-slider-value',
        y_align: Clutter.ActorAlign.CENTER,
        style: 'min-width: 36px; text-align: right; font-size: 12px;',
    });
    const slider = createSlider({
        initialValue: 0,
        onChange: value => {
            const pct = Math.round(value * 100);
            if (sink)
                sink.volume = value * control.get_vol_max_norm();
            updateIconIfChanged(pct);
            pctLabel.text = `${pct}%`;
        },
    });
    row.add_child(slider.actor);
    row.add_child(pctLabel);

    control = getMixerControl();
    if (!control) {
        logError(new Error('material-panel: Gvc unavailable, volume slider disabled'));
        slider.actor.reactive = false;
        return row;
    }

    const syncFromSink = () => {
        if (!sink)
            return;
        const pct = sink.volume / control.get_vol_max_norm();
        slider.setValue(pct);
        const pctInt = Math.round(pct * 100);
        updateIconIfChanged(pctInt);
        pctLabel.text = sink.is_muted ? 'mute' : `${pctInt}%`;
    };

    const attachSink = () => {
        if (sink) {
            if (sinkVolumeId) {
                sink.disconnect(sinkVolumeId);
                sinkVolumeId = 0;
            }
            if (sinkMuteId) {
                sink.disconnect(sinkMuteId);
                sinkMuteId = 0;
            }
        }
        sink = control.get_default_sink();
        if (sink) {
            sinkVolumeId = sink.connect('notify::volume', syncFromSink);
            // Also watch for mute changes so icon reflects muted state
            try { sinkMuteId = sink.connect('notify::is-muted', syncFromSink); } catch (e) {}
            syncFromSink();
        }
    };
    controlStateId = control.connect('state-changed', (_c, state) => {
        if (state === Gvc.MixerControlState.READY)
            attachSink();
    });
    controlDefaultSinkId = control.connect('default-sink-changed', attachSink);
    // If control is already READY (cached), state-changed won't fire again
    try {
        if (control.get_state() === Gvc.MixerControlState.READY)
            attachSink();
    } catch (e) {}

    row._materialPanelDestroy = () => {
        if (sink) {
            if (sinkVolumeId) {
                sink.disconnect(sinkVolumeId);
                sinkVolumeId = 0;
            }
            if (sinkMuteId) {
                sink.disconnect(sinkMuteId);
                sinkMuteId = 0;
            }
        }
        if (control) {
            if (controlStateId) {
                control.disconnect(controlStateId);
                controlStateId = 0;
            }
            if (controlDefaultSinkId) {
                control.disconnect(controlDefaultSinkId);
                controlDefaultSinkId = 0;
            }
        }
    };

    row.connect('destroy', () => row._materialPanelDestroy?.());

    return row;
}

// Brightness via GNOME Settings Daemon's D-Bus property - same
// Reads current brightness directly from sysfs and writes changes via
// systemd-logind's SetBrightness method - this is what modern GNOME Shell
// itself actually uses (confirmed via systemd's own docs), not the older
// gnome-settings-daemon Properties interface that a previous version of
// this function tried and that doesn't exist on all systems.
function findBacklightDevice() {
    try {
        const dir = Gio.File.new_for_path('/sys/class/backlight');
        const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        const info = enumerator.next_file(null);
        enumerator.close(null);
        return info ? info.get_name() : null;
    } catch (e) {
        return null;
    }
}

function readIntFile(path) {
    try {
        const [ok, contents] = Gio.File.new_for_path(path).load_contents(null);
        if (!ok)
            return null;
        return parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
    } catch (e) {
        return null;
    }
}

// Uses brightnessctl for writes rather than talking to logind directly -
// it handles device auto-detection and permissions itself (typically via
// a udev rule installed with the package), which sidesteps the D-Bus
// session-resolution issues the logind-direct approach ran into. Requires
// brightnessctl to be installed; degrades to hiding the slider if it
// isn't. Still reads sysfs directly for the live external-change sync,
// since that's just reading and doesn't need elevated permissions.
function brightnessSliderRow() {
    const row = new St.BoxLayout({style_class: 'material-panel-qs-slider-row', x_expand: true});
    const icon = new St.Icon({
        style_class: 'material-panel-qs-slider-icon',
        icon_size: 18,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('brightness'))),
    });
    row.add_child(icon);

    const deviceName = findBacklightDevice();
    if (!deviceName) {
        logError(new Error('material-panel: no /sys/class/backlight device found, hiding brightness slider'));
        row.visible = false;
        return row;
    }

    const devicePath = `/sys/class/backlight/${deviceName}`;
    const maxBrightness = readIntFile(`${devicePath}/max_brightness`);
    const currentBrightness = readIntFile(`${devicePath}/brightness`);
    if (!maxBrightness) {
        logError(new Error(`material-panel: could not read max_brightness for ${deviceName}, hiding slider`));
        row.visible = false;
        return row;
    }

    // Confirm brightnessctl is actually installed before wiring up the
    // slider - a quick synchronous version check, not on the drag hot path.
    let hasBrightnessctl = false;
    try {
        const [ok] = GLib.spawn_command_line_sync('brightnessctl --version');
        hasBrightnessctl = !!ok;
    } catch (e) {
        hasBrightnessctl = false;
    }
    if (!hasBrightnessctl) {
        logError(new Error('material-panel: brightnessctl not installed, hiding brightness slider'));
        row.visible = false;
        return row;
    }

    const initialPct = currentBrightness ? Math.round((currentBrightness / maxBrightness) * 100) : 50;
    const pctLabel = new St.Label({
        text: `${initialPct}%`,
        style_class: 'material-panel-qs-slider-value',
        y_align: Clutter.ActorAlign.CENTER,
        style: 'min-width: 36px; text-align: right; font-size: 12px;',
    });
    const slider = createSlider({
        initialValue: currentBrightness ? currentBrightness / maxBrightness : 0.5,
        onChange: value => {
            const pct = Math.max(1, Math.round(value * 100));
            pctLabel.text = `${pct}%`;
            try {
                GLib.spawn_command_line_async(`brightnessctl set ${pct}%`);
            } catch (e) {
                logError(e, 'material-panel: brightnessctl set failed');
            }
        },
    });
    row.add_child(slider.actor);
    row.add_child(pctLabel);

    // Best-effort live sync if brightness changes externally (hardware
    // keys, another app). sysfs doesn't always support inotify-style
    // change notification depending on the driver - if this never fires,
    // the slider still works fine for reading the initial value and for
    // writing changes, it just won't live-update from outside changes.
    try {
        const brightnessFile = Gio.File.new_for_path(`${devicePath}/brightness`);
        const monitor = brightnessFile.monitor_file(Gio.FileMonitorFlags.NONE, null);
        monitor.connect('changed', () => {
            const val = readIntFile(`${devicePath}/brightness`);
            if (val !== null) {
                slider.setValue(val / maxBrightness);
                pctLabel.text = `${Math.round((val / maxBrightness) * 100)}%`;
            }
        });
        row.connect('destroy', () => monitor.cancel());
    } catch (e) {
        // Non-fatal - just means no live external-change sync.
    }

    return row;
}

function darkModeTile() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    return buildTile({
        iconKey: 'dark-mode',
        label: 'Dark mode',
        isOn: () => settings.get_string('color-scheme') === 'prefer-dark',
        onToggle: () => {
            const on = settings.get_string('color-scheme') === 'prefer-dark';
            settings.set_string('color-scheme', on ? 'default' : 'prefer-dark');
        },
        watch: refresh => {
            const id = settings.connect('changed::color-scheme', refresh);
            return () => settings.disconnect(id);
        },
    });
}

function nightLightTile() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.color'});
    return buildTile({
        iconKey: 'night-light',
        label: 'Night light',
        isOn: () => settings.get_boolean('night-light-enabled'),
        onToggle: () => settings.set_boolean('night-light-enabled', !settings.get_boolean('night-light-enabled')),
        watch: refresh => {
            const id = settings.connect('changed::night-light-enabled', refresh);
            return () => settings.disconnect(id);
        },
    });
}

function dndTile() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
    return buildTile({
        iconKey: 'dnd-active',
        label: 'Do not disturb',
        isOn: () => !settings.get_boolean('show-banners'),
        onToggle: () => settings.set_boolean('show-banners', !settings.get_boolean('show-banners')),
        watch: refresh => {
            const id = settings.connect('changed::show-banners', refresh);
            return () => settings.disconnect(id);
        },
    });
}

// Bluetooth tile is async (D-Bus discovery) so it can't use the synchronous
// buildTile() helper directly - built inline, same visual shape.
function isBluetoothSoftBlocked() {
    try {
        const [ok, out] = GLib.spawn_command_line_sync('rfkill list bluetooth');
        if (!ok || !out) return false;
        const text = new TextDecoder('utf-8').decode(out);
        return text.includes('Soft blocked: yes');
    } catch (e) {
        return false;
    }
}

function bluetoothTile() {
    // Split tile: left 90% toggles power, right ~10% dropdown arrow toggles
    // inline paired-device list. Replaces the previous separate
    // buildBluetoothDeviceList() row below the grid.
    const outer = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'material-panel-qs-bt-tile-outer'});
    const tileRow = new St.BoxLayout({
        style_class: 'material-panel-qs-tile material-panel-qs-bt-tile-row',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    // Main power area — ~90%
    const mainBtn = new St.Button({
        style_class: 'material-panel-qs-bt-main',
        reactive: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const mainBox = new St.BoxLayout({vertical: false, style_class: 'material-panel-qs-tile-content', y_align: Clutter.ActorAlign.CENTER, x_expand: true});
    const icon = new St.Icon({
        style_class: 'material-panel-qs-tile-icon', icon_size: 18, y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off'))),
    });
    const text = makeWrappingLabel('Bluetooth', 'material-panel-qs-tile-label');
    text.x_expand = true;
    mainBox.add_child(icon);
    mainBox.add_child(text);
    mainBtn.set_child(mainBox);

    // Dropdown arrow — ~10% fixed width on right, inside the same tile
    const dropBtn = new St.Button({
        style_class: 'material-panel-qs-bt-drop',
        reactive: true,
        y_align: Clutter.ActorAlign.CENTER,
        style: 'min-width: 28px; width: 28px; padding: 6px 0 6px 6px; margin-left: 4px; border-left: 1px solid rgba(255,255,255,0.12);',
    });
    const dropIcon = new St.Icon({
        icon_name: 'pan-down-symbolic',
        icon_size: 14,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'material-panel-qs-bt-drop-icon',
    });
    dropBtn.set_child(dropIcon);

    tileRow.add_child(mainBtn);
    tileRow.add_child(dropBtn);
    outer.add_child(tileRow);

    // Inline dropdown — hidden until arrow tapped
    const deviceContainer = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-bt-devices material-panel-qs-bt-devices-inline',
    });
    deviceContainer.visible = false;
    outer.add_child(deviceContainer);
    let expanded = false;
    const updateArrow = () => {
        dropIcon.icon_name = expanded ? 'pan-up-symbolic' : 'pan-down-symbolic';
    };

    const BLUEZ_SERVICE = 'org.bluez';
    const ADAPTER_IFACE = 'org.bluez.Adapter1';
    const DEVICE_IFACE = 'org.bluez.Device1';
    let propsProxy = null;
    let currentlyPowered = false;
    let isBlocked = false;
    let objMgrProxy = null;
    let objMgrSignalId = 0;
    let _refreshDevices = null;

    const setPowered = powered => {
        currentlyPowered = powered;
        isBlocked = false;
        const key = powered ? 'bluetooth-on' : 'bluetooth-off';
        icon.gicon = Gio.FileIcon.new(
            Gio.File.new_for_path(powered ? iconPathOnAccent(key) : iconPath(key)));
        tileRow.set_style_class_name(`material-panel-qs-tile material-panel-qs-bt-tile-row${powered ? ' active' : ''}`);
        text.text = 'Bluetooth';
        if (_refreshDevices) _refreshDevices();
    };

    const setBlockedState = () => {
        isBlocked = true;
        currentlyPowered = false;
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off')));
        tileRow.set_style_class_name('material-panel-qs-tile material-panel-qs-bt-tile-row');
        text.text = 'Blocked — tap to unblock';
        if (_refreshDevices) _refreshDevices();
    };

    const setNoAdapterState = () => {
        isBlocked = false;
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off')));
        tileRow.set_style_class_name('material-panel-qs-tile material-panel-qs-bt-tile-row');
        text.text = 'No adapter';
        if (_refreshDevices) _refreshDevices();
    };

    let discoverAttempts = 0;
    const discoverAndBind = () => {
        if (discoverAttempts > 3) return;
        discoverAttempts++;
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            BLUEZ_SERVICE, '/', 'org.freedesktop.DBus.ObjectManager', null,
            (_s, res) => {
                let objMgr;
                try {
                    objMgr = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    logError(e, 'material-panel: bluez unavailable');
                    if (isBluetoothSoftBlocked()) setBlockedState();
                    else setNoAdapterState();
                    return;
                }
                objMgrProxy = objMgr;
                objMgr.call('GetManagedObjects', null, Gio.DBusCallFlags.NONE, -1, null, (proxy, callRes) => {
                    try {
                        const [objects] = proxy.call_finish(callRes).deep_unpack();
                        const path = Object.keys(objects).find(p => ADAPTER_IFACE in objects[p]);
                        if (!path) {
                            if (isBluetoothSoftBlocked()) {
                                log('material-panel: bluez no adapter — rfkill soft blocked, showing unblock UI');
                                setBlockedState();
                            } else {
                                logError(new Error('material-panel: no bluez adapter found (GetManagedObjects returned none)'));
                                setNoAdapterState();
                            }
                            return;
                        }
                        Gio.DBusProxy.new_for_bus(
                            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
                            BLUEZ_SERVICE, path, 'org.freedesktop.DBus.Properties', null,
                            (_s2, res2) => {
                                try {
                                    propsProxy = Gio.DBusProxy.new_for_bus_finish(res2);
                                } catch (e) {
                                    logError(e, 'material-panel: bluez properties proxy failed');
                                    setNoAdapterState();
                                    return;
                                }
                                propsProxy.call('Get', new GLib.Variant('(ss)', [ADAPTER_IFACE, 'Powered']),
                                    Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                                        try {
                                            const [variant] = p.call_finish(r).deep_unpack();
                                            setPowered(variant.deep_unpack());
                                        } catch (e) {
                                            logError(e, 'material-panel: bluez Get Powered failed');
                                        }
                                    });
                                propsProxy.connect('g-signal', (_p, _sender, signal, params) => {
                                    if (signal !== 'PropertiesChanged')
                                        return;
                                    const [iface, changed] = params.deep_unpack();
                                    if (iface === ADAPTER_IFACE && 'Powered' in changed)
                                        setPowered(changed['Powered'].deep_unpack());
                                });
                                objMgr.connect('g-signal', (_p, _s, sig) => {
                                    if (sig === 'InterfacesAdded' && !propsProxy) {
                                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
                                            discoverAttempts = 0;
                                            discoverAndBind();
                                            return GLib.SOURCE_REMOVE;
                                        });
                                    }
                                });
                            });
                    } catch (e) {
                        logError(e, 'material-panel: bluez GetManagedObjects failed');
                        if (isBluetoothSoftBlocked()) setBlockedState();
                        else setNoAdapterState();
                    }
                });
            });
    };

    const togglePower = () => {
        if (isBlocked) {
            try {
                GLib.spawn_command_line_async('rfkill unblock bluetooth');
                log('material-panel: rfkill unblock bluetooth requested');
                text.text = 'Unblocking…';
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                    discoverAttempts = 0;
                    discoverAndBind();
                    return GLib.SOURCE_REMOVE;
                });
            } catch (e) {
                logError(e, 'material-panel: rfkill unblock failed');
            }
            return;
        }
        if (!propsProxy) {
            discoverAttempts = 0;
            discoverAndBind();
            logError(new Error('material-panel: bluetooth toggle clicked before adapter proxy was ready — retrying discovery'));
            return;
        }
        propsProxy.call('Set', new GLib.Variant('(ssv)',
            [ADAPTER_IFACE, 'Powered', new GLib.Variant('b', !currentlyPowered)]),
            Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                try {
                    p.call_finish(r);
                } catch (e) {
                    logError(e, 'material-panel: bluez Set Powered failed');
                }
            });
    };

    mainBtn.connect('clicked', () => {
        togglePower();
        return Clutter.EVENT_STOP;
    });

    // Device list logic — inline, toggled by dropBtn (10% area)
    const buildDeviceRow = (path, props) => {
        const alias = props['Alias'] ? props['Alias'].deep_unpack() : null;
        const name = props['Name'] ? props['Name'].deep_unpack() : null;
        const displayName = alias ?? name ?? 'Unknown device';
        const connected = props['Connected'] ? props['Connected'].deep_unpack() : false;
        const row = new St.Button({
            style_class: `material-panel-qs-bt-device${connected ? ' connected' : ''}`,
            reactive: true,
            x_expand: true,
        });
        const rowBox = new St.BoxLayout({x_expand: true});
        const devIcon = new St.Icon({
            style_class: 'material-panel-qs-bt-device-icon',
            icon_size: 15,
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(
                connected ? iconPathOnAccent('bluetooth-on') : iconPathPrimary('bluetooth-off'))),
        });
        const nameLabel = makeWrappingLabel(displayName, 'material-panel-qs-bt-device-name');
        nameLabel.x_expand = true;
        const statusLabel = new St.Label({
            text: connected ? 'Connected' : 'Tap to connect',
            style_class: 'material-panel-qs-bt-device-status',
            y_align: Clutter.ActorAlign.CENTER,
        });
        rowBox.add_child(devIcon);
        rowBox.add_child(nameLabel);
        rowBox.add_child(statusLabel);
        row.set_child(rowBox);
        row.connect('clicked', () => {
            Gio.DBusProxy.new_for_bus(
                Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
                BLUEZ_SERVICE, path, DEVICE_IFACE, null,
                (_s, res) => {
                    let deviceProxy;
                    try {
                        deviceProxy = Gio.DBusProxy.new_for_bus_finish(res);
                    } catch (e) {
                        logError(e, `material-panel: bluez device proxy failed for "${displayName}"`);
                        return;
                    }
                    const method = connected ? 'Disconnect' : 'Connect';
                    deviceProxy.call(method, null, Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                        try {
                            p.call_finish(r);
                        } catch (e) {
                            logError(e, `material-panel: bluez ${method} failed for "${displayName}"`);
                        }
                    });
                });
            return Clutter.EVENT_STOP;
        });
        return row;
    };

    const setupDeviceList = () => {
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            BLUEZ_SERVICE, '/', 'org.freedesktop.DBus.ObjectManager', null,
            (_s, res) => {
                let devMgr;
                try {
                    devMgr = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    logError(e, 'material-panel: bluez unavailable, device list stays empty');
                    return;
                }
                const refresh = () => {
                    devMgr.call('GetManagedObjects', null, Gio.DBusCallFlags.NONE, -1, null, (proxy, callRes) => {
                        try {
                            const [objects] = proxy.call_finish(callRes).deep_unpack();
                            deviceContainer.destroy_all_children();
                            const hasAdapter = Object.values(objects).some(ifaces => ADAPTER_IFACE in ifaces);
                            if (!hasAdapter) {
                                try {
                                    const [ok, out] = GLib.spawn_command_line_sync('rfkill list bluetooth');
                                    const blocked = ok && out && new TextDecoder('utf-8').decode(out).includes('Soft blocked: yes');
                                    if (blocked) {
                                        const hint = new St.Label({text: 'Blocked — tap main area to unblock', style_class: 'material-panel-qs-bt-device-status'});
                                        hint.style = 'font-style: italic; padding: 4px 8px;';
                                        deviceContainer.add_child(hint);
                                        deviceContainer.visible = expanded;
                                        return;
                                    }
                                } catch (e) {}
                                const hint = new St.Label({text: 'No adapter', style_class: 'material-panel-qs-bt-device-status'});
                                hint.style = 'font-style: italic; padding: 4px 8px;';
                                deviceContainer.add_child(hint);
                                deviceContainer.visible = expanded ? true : false;
                                return;
                            }
                            if (!currentlyPowered) {
                                const hint = new St.Label({text: 'Bluetooth off — turn on to see devices', style_class: 'material-panel-qs-bt-device-status'});
                                hint.style = 'font-style: italic; padding: 4px 8px;';
                                deviceContainer.add_child(hint);
                                deviceContainer.visible = expanded;
                                return;
                            }
                            const pairedDevices = Object.entries(objects)
                                .filter(([, ifaces]) => DEVICE_IFACE in ifaces)
                                .map(([path, ifaces]) => ({path, props: ifaces[DEVICE_IFACE]}))
                                .filter(({props}) => props['Paired']?.deep_unpack());
                            if (pairedDevices.length === 0) {
                                const hint = new St.Label({text: 'No paired devices — pair in Settings', style_class: 'material-panel-qs-bt-device-status'});
                                hint.style = 'font-style: italic; padding: 4px 8px;';
                                deviceContainer.add_child(hint);
                                deviceContainer.visible = expanded;
                                return;
                            }
                            deviceContainer.visible = expanded;
                            for (const {path, props} of pairedDevices)
                                deviceContainer.add_child(buildDeviceRow(path, props));
                        } catch (e) {
                            logError(e, 'material-panel: bluez GetManagedObjects failed for device list');
                        }
                    });
                };
                _refreshDevices = refresh;
                refresh();
                const changedId = devMgr.connect('g-signal', (_p, _sender, signal) => {
                    if (signal === 'InterfacesAdded' || signal === 'InterfacesRemoved')
                        refresh();
                });
                deviceContainer.connect('destroy', () => {
                    try { devMgr.disconnect(changedId); } catch (e) {}
                });
                outer.connect('destroy', () => {
                    try { devMgr.disconnect(changedId); } catch (e) {}
                });
            });
    };

    dropBtn.connect('clicked', () => {
        expanded = !expanded;
        deviceContainer.visible = expanded;
        updateArrow();
        if (expanded && _refreshDevices) _refreshDevices();
        return Clutter.EVENT_STOP;
    });

    // Also allow clicking the narrow arrow area to not trigger power toggle
    // (handled by separate buttons; mainBtn only toggles power).

    discoverAndBind();
    setupDeviceList();

    // Cleanup
    outer.connect('destroy', () => {
        if (objMgrProxy && objMgrSignalId) try { objMgrProxy.disconnect(objMgrSignalId); } catch (e) {}
    });

    return outer;
}

// Lists already-paired devices and lets you connect/disconnect. Doesn't
// support discovering/pairing NEW devices - that needs BlueZ's pairing
// agent flow (PIN/passkey prompts), a bigger separate feature. Same
// scoping decision as the wifi module (reconnect to known networks only).
// Now wrapped in a collapsible dropdown — header always visible, devices
// hidden until user taps the header (so the QS doesn't always show the
// list, as requested).
function buildBluetoothDeviceList() {
    const outer = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-bt-dropdown',
    });
    const header = new St.Button({
        style_class: 'material-panel-qs-bt-header',
        reactive: true,
        x_expand: true,
    });
    const headerBox = new St.BoxLayout({x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    const headerLabel = new St.Label({
        text: 'Paired devices',
        style_class: 'material-panel-qs-bt-header-label',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const headerArrow = new St.Icon({
        icon_name: 'pan-down-symbolic',
        icon_size: 14,
        y_align: Clutter.ActorAlign.CENTER,
    });
    headerBox.add_child(headerLabel);
    headerBox.add_child(headerArrow);
    header.set_child(headerBox);
    outer.add_child(header);

    let expanded = false;
    const updateArrow = () => {
        headerArrow.icon_name = expanded ? 'pan-up-symbolic' : 'pan-down-symbolic';
    };
    const container = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-qs-bt-devices',
        x_expand: true,
    });
    container.visible = false; // collapsed by default
    outer.add_child(container);
    header.connect('clicked', () => {
        expanded = !expanded;
        container.visible = expanded;
        updateArrow();
        // If expanding and we haven't yet populated (first open after rfkill
        // unblock), trigger a refresh via the closure below — handled by
        // calling the outer refresh if available.
        if (expanded && container.get_n_children() === 0) {
            // hint will be added on next refresh; force a re-query
            if (outer._triggerRefresh) outer._triggerRefresh();
        }
        return Clutter.EVENT_STOP;
    });

    const BLUEZ_SERVICE = 'org.bluez';
    const DEVICE_IFACE = 'org.bluez.Device1';

    const buildDeviceRow = (path, props) => {
        const alias = props['Alias'] ? props['Alias'].deep_unpack() : null;
        const name = props['Name'] ? props['Name'].deep_unpack() : null;
        const displayName = alias ?? name ?? 'Unknown device';
        const connected = props['Connected'] ? props['Connected'].deep_unpack() : false;

        const row = new St.Button({
            style_class: `material-panel-qs-bt-device${connected ? ' connected' : ''}`,
            reactive: true,
            x_expand: true,
        });
        const rowBox = new St.BoxLayout({x_expand: true});
        const icon = new St.Icon({
            style_class: 'material-panel-qs-bt-device-icon',
            icon_size: 15,
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(
                connected ? iconPathOnAccent('bluetooth-on') : iconPathPrimary('bluetooth-off'))),
        });
        const nameLabel = makeWrappingLabel(displayName, 'material-panel-qs-bt-device-name');
        nameLabel.x_expand = true;
        const statusLabel = new St.Label({
            text: connected ? 'Connected' : 'Tap to connect',
            style_class: 'material-panel-qs-bt-device-status',
            y_align: Clutter.ActorAlign.CENTER,
        });
        rowBox.add_child(icon);
        rowBox.add_child(nameLabel);
        rowBox.add_child(statusLabel);
        row.set_child(rowBox);

        row.connect('clicked', () => {
            Gio.DBusProxy.new_for_bus(
                Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
                BLUEZ_SERVICE, path, DEVICE_IFACE, null,
                (_s, res) => {
                    let deviceProxy;
                    try {
                        deviceProxy = Gio.DBusProxy.new_for_bus_finish(res);
                    } catch (e) {
                        logError(e, `material-panel: bluez device proxy failed for "${displayName}"`);
                        return;
                    }
                    const method = connected ? 'Disconnect' : 'Connect';
                    deviceProxy.call(method, null, Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                        try {
                            p.call_finish(r);
                        } catch (e) {
                            logError(e, `material-panel: bluez ${method} failed for "${displayName}"`);
                        }
                    });
                });
        });

        return row;
    };

    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
        BLUEZ_SERVICE, '/', 'org.freedesktop.DBus.ObjectManager', null,
        (_s, res) => {
            let objMgr;
            try {
                objMgr = Gio.DBusProxy.new_for_bus_finish(res);
            } catch (e) {
                logError(e, 'material-panel: bluez unavailable, device list stays empty');
                return;
            }

            const refresh = () => {
                objMgr.call('GetManagedObjects', null, Gio.DBusCallFlags.NONE, -1, null, (proxy, callRes) => {
                    try {
                        const [objects] = proxy.call_finish(callRes).deep_unpack();
                        container.destroy_all_children();
                        const ADAPTER_IFACE_LOCAL = 'org.bluez.Adapter1';
                        const hasAdapter = Object.values(objects).some(ifaces => ADAPTER_IFACE_LOCAL in ifaces);
                        if (!hasAdapter) {
                            // No adapter at all — likely rfkill blocked; show hint instead of empty
                            try {
                                const [ok, out] = GLib.spawn_command_line_sync('rfkill list bluetooth');
                                const blocked = ok && out && new TextDecoder('utf-8').decode(out).includes('Soft blocked: yes');
                                if (blocked) {
                                    const hint = new St.Label({text: 'Bluetooth blocked — tap tile above to unblock', style_class: 'material-panel-qs-bt-device-status'});
                                    hint.style = 'font-style: italic; padding: 4px 8px;';
                                    container.add_child(hint);
                                    headerLabel.text = 'Paired devices — blocked';
                                    // keep collapsed state; only show if already expanded
                                    container.visible = expanded;
                                    return;
                                }
                            } catch (e) {}
                            headerLabel.text = 'Paired devices — no adapter';
                            container.visible = false;
                            return;
                        }
                        const pairedDevices = Object.entries(objects)
                            .filter(([, ifaces]) => DEVICE_IFACE in ifaces)
                            .map(([path, ifaces]) => ({path, props: ifaces[DEVICE_IFACE]}))
                            .filter(({props}) => props['Paired']?.deep_unpack());

                        headerLabel.text = `Paired devices (${pairedDevices.length})`;
                        if (pairedDevices.length === 0) {
                            const hint = new St.Label({text: 'No paired devices — pair in Settings', style_class: 'material-panel-qs-bt-device-status'});
                            hint.style = 'font-style: italic; padding: 4px 8px;';
                            container.add_child(hint);
                            container.visible = expanded;
                            return;
                        }
                        container.visible = expanded;
                        for (const {path, props} of pairedDevices)
                            container.add_child(buildDeviceRow(path, props));
                    } catch (e) {
                        logError(e, 'material-panel: bluez GetManagedObjects failed for device list');
                    }
                });
            };
            outer._triggerRefresh = refresh;
            refresh();

            // Re-list on devices being paired/removed. Doesn't subscribe to
            // per-device PropertiesChanged (Connected state flipping) - a
            // reasonable v2 addition, not done here to keep this scoped.
            const changedId = objMgr.connect('g-signal', (_p, _sender, signal) => {
                if (signal === 'InterfacesAdded' || signal === 'InterfacesRemoved')
                    refresh();
            });
            container.connect('destroy', () => objMgr.disconnect(changedId));
            outer.connect('destroy', () => {
                try { objMgr.disconnect(changedId); } catch (e) {}
            });
        });

    return outer;
}

const POWER_ACTIONS = [
    {iconKey: 'lock', command: 'loginctl lock-session'},
    {iconKey: 'suspend', command: 'systemctl suspend'},
    {iconKey: 'restart', command: 'systemctl reboot'},
    {iconKey: 'shutdown', command: 'systemctl poweroff'},
];

function powerRow() {
    const row = new St.BoxLayout({style_class: 'material-panel-qs-power-row', x_expand: true});
    for (const {iconKey, command} of POWER_ACTIONS) {
        const btn = new St.Button({
            style_class: 'material-panel-qs-power-btn',
            reactive: true,
            x_expand: true,
            child: new St.Icon({
                icon_size: 18,
                y_align: Clutter.ActorAlign.CENTER,
                gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath(iconKey))),
            }),
        });
        btn.connect('clicked', () => {
            try {
                GLib.spawn_command_line_async(command);
            } catch (e) {
                logError(e, `material-panel: failed to run "${command}"`);
            }
        });
        row.add_child(btn);
    }
    return row;
}

function addPopupDismiss(menu, button) {
    // Click outside + Esc to close — uses coordinate hit-test via
    // get_actor_at_pos() rather than event.get_source(), because
    // captured-event's source is the stage itself at capture time, so
    // parent-chain walking on get_source() always missed and closed on
    // inside clicks. Also uses captured-event for Esc so it fires even
    // when PopupMenu has a grab.
    const stage = global.stage;
    const isMenuOpen = () => menu.isOpen ?? menu.actor.visible;
    const clickId = stage.connect('captured-event', (actor, event) => {
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
    const keyId = stage.connect('captured-event', (actor, event) => {
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

export function buildQuickSettings(_extensionPath, scale = 1.0) {
    const button = new St.Button({
        style_class: 'material-panel-quicksettings-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            icon_size: Math.round(17 * scale),
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('settings'))),
        }),
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-qs-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    addPopupDismiss(menu, button);

    menu.addMenuItem(wrapAsMenuItem(buildProfileCard()));
    menu.addMenuItem(wrapAsMenuItem(buildMediaPlayerRow()));
    menu.addMenuItem(wrapAsMenuItem(volumeSliderRow()));
    menu.addMenuItem(wrapAsMenuItem(brightnessSliderRow()));
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const grid = new St.Widget({
        style_class: 'material-panel-qs-grid',
        layout_manager: new Clutter.GridLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            column_spacing: 8,
            row_spacing: 8,
        }),
    });
    const layout = grid.layout_manager;
    const tiles = [darkModeTile(), nightLightTile(), dndTile(), bluetoothTile()];
    tiles.forEach((tile, i) => {
        layout.attach(tile, i % 2, Math.floor(i / 2), 1, 1);
    });

    menu.addMenuItem(wrapAsMenuItem(grid));

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    menu.addMenuItem(wrapAsMenuItem(powerRow()));

    button.connect('clicked', () => menu.toggle());
    button.connect('destroy', () => menu.destroy());

    return button;
}
