import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Gvc from 'gi://Gvc';
import NM from 'gi://NM';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss, closeAfter} from '../lib/popupDismiss.js';
import {createSlider} from '../lib/simpleSlider.js';
import {getMixerControl} from '../lib/audio.js';
import {buildProfileCard} from './profileCard.js';
import {buildMediaPlayerRow} from './mediaPlayer.js';

import {iconPath, iconPathOnAccent, iconPathPrimary} from '../lib/iconTheme.js';
import {startNetSpeedMonitor} from '../lib/netSpeedMonitor.js';

const EXTENSION_UUID = 'material-panel@SakibShahariar';

// Only one of BT / Wi-Fi lists open at a time.
// Use a function so call sites never hit a TDZ / missing-binding ReferenceError
// if the module is partially reloaded.
function getQsExpandController() {
    if (!globalThis._materialPanelQsExpand) {
        globalThis._materialPanelQsExpand = {
            _apis: new Map(),
            register(id, api) {
                this._apis.set(id, api);
            },
            unregister(id) {
                this._apis.delete(id);
            },
            expandOnly(id) {
                for (const [key, api] of this._apis.entries()) {
                    try {
                        api.setExpanded(key === id);
                    } catch (e) {}
                }
            },
        };
    }
    return globalThis._materialPanelQsExpand;
}
const qsExpandController = getQsExpandController();


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
    // Equal share of the row width; fixed height so active/inactive match.
    const tile = new St.Button({
        style_class: 'material-panel-qs-tile',
        reactive: true,
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.FILL,
        height: 48,
        // Natural width ignored when grid is column-homogeneous
        width: 148,
    });
    const box = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-qs-tile-content',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    const icon = new St.Icon({
        style_class: 'material-panel-qs-tile-icon',
        icon_size: 18,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath(iconKey))),
    });
    // Single line + ellipsis — wrapping made "Do not disturb" taller/wider
    const text = new St.Label({
        text: label,
        style_class: 'material-panel-qs-tile-label',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    text.clutter_text.line_wrap = false;
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

    // Light press feedback (scale) — end-4/Caelestia-style, cheap in St
    tile.connect('button-press-event', () => {
        tile.set_pivot_point(0.5, 0.5);
        tile.ease?.({
            scale_x: 0.96,
            scale_y: 0.96,
            duration: 80,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        try {
            tile.scale_x = 0.96;
            tile.scale_y = 0.96;
        } catch (e) {}
        return Clutter.EVENT_PROPAGATE;
    });
    const restoreScale = () => {
        try {
            tile.scale_x = 1;
            tile.scale_y = 1;
        } catch (e) {}
        try {
            tile.ease?.({
                scale_x: 1,
                scale_y: 1,
                duration: 120,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } catch (e) {}
    };
    tile.connect('button-release-event', () => {
        restoreScale();
        return Clutter.EVENT_PROPAGATE;
    });
    tile.connect('leave-event', () => {
        restoreScale();
        return Clutter.EVENT_PROPAGATE;
    });

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

/** Vertical stack used as a QS section (consistent 8px spacing). */
function qsSection(styleExtra, ...children) {
    const box = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: `material-panel-qs-section${styleExtra ? ' ' + styleExtra : ''}`,
    });
    for (const child of children) {
        if (child)
            box.add_child(child);
    }
    return box;
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
            if (sink && control) {
                // Gvc: assigning volume alone is a no-op until push_volume()
                // ships it to Pulse/PipeWire (same as stock GNOME QS).
                try {
                    if (sink.is_muted && value > 0)
                        sink.change_is_muted(false);
                } catch (e) {}
                sink.volume = Math.round(value * control.get_vol_max_norm());
                try {
                    sink.push_volume();
                } catch (e) {
                    logError(e, 'material-panel: sink.push_volume failed');
                }
            }
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
        label: 'Do not disturb',  // full label; cell width is grid-homogeneous
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
    // Grid cell only: power toggle + chevron. Device list is a SEPARATE
    // full-width panel below the 2-col grid (attached as outer.devicePanel)
    // so expanding devices never stretches the right column wider than left.
    const outer = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.FILL,
        height: 48,
        width: 148,
        style_class: 'material-panel-qs-bt-tile-outer',
    });
    const tileRow = new St.BoxLayout({
        style_class: 'material-panel-qs-tile material-panel-qs-bt-tile-row',
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.FILL,
        height: 48,
    });
    const mainBtn = new St.Button({
        style_class: 'material-panel-qs-bt-main',
        reactive: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const mainBox = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-qs-tile-content',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    const icon = new St.Icon({
        style_class: 'material-panel-qs-tile-icon',
        icon_size: 18,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off'))),
    });
    // Single-line label (no wrap) so long status text cannot widen the column
    const text = new St.Label({
        text: 'Bluetooth',
        style_class: 'material-panel-qs-tile-label',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    text.clutter_text.line_wrap = false;
    mainBox.add_child(icon);
    mainBox.add_child(text);
    mainBtn.set_child(mainBox);

    const dropBtn = new St.Button({
        style_class: 'material-panel-qs-bt-drop',
        reactive: true,
        y_align: Clutter.ActorAlign.CENTER,
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

    // Full-width device panel — parented under the QS menu, not this column
    const deviceContainer = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-bt-devices material-panel-qs-bt-devices-panel',
    });
    deviceContainer.visible = false;
    outer.devicePanel = deviceContainer;

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
    const connectingPaths = new Set();
    const pulseTimers = new Map();

    const stopPulse = path => {
        const id = pulseTimers.get(path);
        if (id) {
            try { GLib.source_remove(id); } catch (e) {}
            pulseTimers.delete(path);
        }
    };

    const startPulse = (path, iconActor) => {
        stopPulse(path);
        let tick = 0;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 90, () => {
            if (!connectingPaths.has(path)) {
                try { iconActor.opacity = 255; } catch (e) {}
                pulseTimers.delete(path);
                return GLib.SOURCE_REMOVE;
            }
            tick++;
            try {
                iconActor.opacity = 100 + Math.floor(120 * (0.5 + 0.5 * Math.sin(tick * 0.45)));
            } catch (e) {}
            return GLib.SOURCE_CONTINUE;
        });
        pulseTimers.set(path, id);
    };

    const buildDeviceRow = (path, props, isPaired = true, batteryPct = null) => {
        const alias = props['Alias'] ? props['Alias'].deep_unpack() : null;
        const name = props['Name'] ? props['Name'].deep_unpack() : null;
        const displayName = alias ?? name ?? 'Unknown device';
        const connected = props['Connected'] ? props['Connected'].deep_unpack() : false;
        const paired = props['Paired'] ? props['Paired'].deep_unpack() : false;
        const isConnecting = connectingPaths.has(path);
        if (connected)
            connectingPaths.delete(path);

        if (batteryPct == null) {
            try {
                if ('Battery' in props && props['Battery'])
                    batteryPct = props['Battery'].deep_unpack();
            } catch (e) {}
        }

        let deviceClass = null;
        try {
            if ('Class' in props && props['Class'])
                deviceClass = props['Class'].deep_unpack();
        } catch (e) {}

        const iconName = getDeviceIcon(deviceClass, connected || isConnecting);
        const iconPathStr = connected
            ? iconPathOnAccent(iconName)
            : iconPathPrimary(iconName);

        let style = 'material-panel-qs-bt-device';
        if (connected)
            style += ' connected';
        if (isConnecting)
            style += ' connecting';
        if (!paired)
            style += ' unpaired';

        const row = new St.Button({
            style_class: style,
            reactive: true,
            x_expand: true,
        });
        const rowBox = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'material-panel-qs-bt-device-box',
        });
        const devIcon = new St.Icon({
            style_class: 'material-panel-qs-bt-device-icon',
            icon_size: 16,
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathStr)),
        });
        if (isConnecting)
            startPulse(path, devIcon);
        else
            stopPulse(path);

        const textBox = new St.BoxLayout({vertical: true, x_expand: true});
        const nameLabel = makeWrappingLabel(displayName, 'material-panel-qs-bt-device-name');
        nameLabel.x_expand = true;

        let statusText;
        if (isConnecting)
            statusText = 'Connecting…';
        else if (connected)
            statusText = batteryPct !== null ? `Connected · ${batteryPct}%` : 'Connected';
        else if (paired)
            statusText = batteryPct !== null
                ? `Disconnected · ${batteryPct}%`
                : 'Disconnected · Tap to connect';
        else
            statusText = 'Available · Tap to pair';

        const statusLabel = new St.Label({
            text: statusText,
            style_class: 'material-panel-qs-bt-device-status',
            y_align: Clutter.ActorAlign.CENTER,
        });
        statusLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        textBox.add_child(nameLabel);
        textBox.add_child(statusLabel);

        const actionIcon = new St.Icon({
            style_class: 'material-panel-qs-bt-device-action',
            icon_name: isConnecting
                ? 'content-loading-symbolic'
                : (connected ? 'object-select-symbolic' : 'list-add-symbolic'),
            icon_size: 14,
            y_align: Clutter.ActorAlign.CENTER,
        });
        rowBox.add_child(devIcon);
        rowBox.add_child(textBox);
        rowBox.add_child(actionIcon);
        row.set_child(rowBox);

        row.connect('clicked', () => {
            if (connectingPaths.has(path))
                return Clutter.EVENT_STOP;
            const method = connected ? 'Disconnect' : 'Connect';
            if (method === 'Connect') {
                connectingPaths.add(path);
                statusLabel.text = 'Connecting…';
                row.add_style_class_name('connecting');
                actionIcon.icon_name = 'content-loading-symbolic';
                startPulse(path, devIcon);
            }
            Gio.DBusProxy.new_for_bus(
                Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
                BLUEZ_SERVICE, path, DEVICE_IFACE, null,
                (_s, res) => {
                    let deviceProxy;
                    try {
                        deviceProxy = Gio.DBusProxy.new_for_bus_finish(res);
                    } catch (e) {
                        logError(e, `material-panel: bluez device proxy failed for "${displayName}"`);
                        connectingPaths.delete(path);
                        stopPulse(path);
                        if (_refreshDevices) _refreshDevices();
                        return;
                    }
                    const done = (ok) => {
                        if (!ok) {
                            connectingPaths.delete(path);
                            stopPulse(path);
                        }
                        if (_refreshDevices)
                            _refreshDevices();
                    };
                    if (!paired && method === 'Connect') {
                        deviceProxy.call('Pair', null, Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                            try {
                                p.call_finish(r);
                            } catch (e) {
                                logError(e, `material-panel: bluez Pair failed for "${displayName}"`);
                                done(false);
                                return;
                            }
                            deviceProxy.call('Connect', null, Gio.DBusCallFlags.NONE, -1, null, (p2, r2) => {
                                try {
                                    p2.call_finish(r2);
                                    done(true);
                                } catch (e) {
                                    logError(e, `material-panel: bluez Connect failed for "${displayName}"`);
                                    done(false);
                                }
                            });
                        });
                        return;
                    }
                    deviceProxy.call(method, null, Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                        try {
                            p.call_finish(r);
                            done(true);
                        } catch (e) {
                            logError(e, `material-panel: bluez ${method} failed for "${displayName}"`);
                            done(false);
                        }
                    });
                });
            return Clutter.EVENT_STOP;
        });
        return row;
    };

    function getDeviceIcon(deviceClass, connected) {
        if (!deviceClass) return 'bluetooth-on';
        // Bluetooth device class major service classes
        // Audio/Video: 0x200400
        // Headset: 0x200404
        // Keyboard: 0x002540
        // Mouse: 0x002580
        // Phone: 0x100000
        // Computer: 0x000100
        const cls = deviceClass;
        if ((cls & 0x200000) !== 0) return 'headphones'; // Audio
        if ((cls & 0x000500) !== 0) return 'keyboard'; // Keyboard/Mouse
        if ((cls & 0x100000) !== 0) return 'phone'; // Phone
        if ((cls & 0x000100) !== 0) return 'computer'; // Computer
        return 'bluetooth-on';
    }

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
                                        const hint = new St.Label({text: 'Blocked — tap main area to unblock', style_class: 'material-panel-qs-bt-empty'});
                                        hint.style = 'font-style: italic; padding: 4px 8px;';
                                        deviceContainer.add_child(hint);
                                        deviceContainer.visible = expanded;
                                        return;
                                    }
                                } catch (e) {}
                                const hint = new St.Label({text: 'No adapter', style_class: 'material-panel-qs-bt-empty'});
                                hint.style = 'font-style: italic; padding: 4px 8px;';
                                deviceContainer.add_child(hint);
                                deviceContainer.visible = expanded ? true : false;
                                return;
                            }
                            if (!currentlyPowered) {
                                const hint = new St.Label({text: 'Bluetooth off — turn on to see devices', style_class: 'material-panel-qs-bt-empty'});
                                hint.style = 'font-style: italic; padding: 4px 8px;';
                                deviceContainer.add_child(hint);
                                deviceContainer.visible = expanded;
                                return;
                            }
                            const pairedDevices = Object.entries(objects)
                                .filter(([, ifaces]) => DEVICE_IFACE in ifaces)
                                .map(([path, ifaces]) => {
                                    let batteryPct = null;
                                    try {
                                        const bat = ifaces['org.bluez.Battery1'];
                                        if (bat && bat['Percentage'])
                                            batteryPct = bat['Percentage'].deep_unpack();
                                    } catch (e) {}
                                    return {path, props: ifaces[DEVICE_IFACE], batteryPct};
                                })
                                .filter(({props}) => props['Paired']?.deep_unpack());
                            // Also show unpaired nearby devices
                            const nearbyDevices = Object.entries(objects)
                                .filter(([, ifaces]) => DEVICE_IFACE in ifaces)
                                .map(([path, ifaces]) => {
                                    let batteryPct = null;
                                    try {
                                        const bat = ifaces['org.bluez.Battery1'];
                                        if (bat && bat['Percentage'])
                                            batteryPct = bat['Percentage'].deep_unpack();
                                    } catch (e) {}
                                    return {path, props: ifaces[DEVICE_IFACE], batteryPct};
                                })
                                .filter(({props}) => !props['Paired']?.deep_unpack() && props['Name']?.deep_unpack());
                            if (pairedDevices.length === 0 && nearbyDevices.length === 0) {
                                const hint = new St.Label({text: 'No paired devices — pair in Settings', style_class: 'material-panel-qs-bt-empty'});
                                hint.style = 'font-style: italic; padding: 4px 8px;';
                                deviceContainer.add_child(hint);
                                deviceContainer.visible = expanded;
                                return;
                            }
                            deviceContainer.visible = expanded;
                            deviceContainer.add_child(new St.Label({
                                text: 'Bluetooth',
                                style_class: 'material-panel-qs-list-header',
                            }));
                            for (const {path, props, batteryPct} of pairedDevices)
                                deviceContainer.add_child(buildDeviceRow(path, props, true, batteryPct));
                            if (nearbyDevices.length > 0) {
                                deviceContainer.add_child(new St.Label({
                                    text: 'Nearby',
                                    style_class: 'material-panel-qs-list-header material-panel-qs-list-header-sub',
                                }));
                                for (const {path, props, batteryPct} of nearbyDevices.slice(0, 6))
                                    deviceContainer.add_child(buildDeviceRow(path, props, false, batteryPct));
                            }
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

    const setExpanded = v => {
        expanded = !!v;
        deviceContainer.visible = expanded;
        const menuItem = deviceContainer.get_parent();
        if (menuItem)
            menuItem.visible = expanded;
        updateArrow();
        try {
            if (expanded)
                dropBtn.add_style_class_name('list-open');
            else
                dropBtn.remove_style_class_name('list-open');
        } catch (e) {}
        if (expanded && _refreshDevices)
            _refreshDevices();
    };

    dropBtn.connect('clicked', () => {
        if (expanded)
            getQsExpandController().expandOnly(null);
        else
            getQsExpandController().expandOnly('bt');
        return Clutter.EVENT_STOP;
    });

    getQsExpandController().register('bt', {setExpanded});

    discoverAndBind();
    setupDeviceList();

    outer.connect('destroy', () => {
        getQsExpandController().unregister('bt');
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
                                    const hint = new St.Label({text: 'Bluetooth blocked — tap tile above to unblock', style_class: 'material-panel-qs-bt-empty'});
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
                            .map(([path, ifaces]) => {
                                    let batteryPct = null;
                                    try {
                                        const bat = ifaces['org.bluez.Battery1'];
                                        if (bat && bat['Percentage'])
                                            batteryPct = bat['Percentage'].deep_unpack();
                                    } catch (e) {}
                                    return {path, props: ifaces[DEVICE_IFACE], batteryPct};
                                })
                            .filter(({props}) => props['Paired']?.deep_unpack());

                        headerLabel.text = `Paired devices (${pairedDevices.length})`;
                        if (pairedDevices.length === 0) {
                            const hint = new St.Label({text: 'No paired devices — pair in Settings', style_class: 'material-panel-qs-bt-empty'});
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

function openExtensionPrefs() {
    try {
        Main.extensionManager.openExtensionPrefs(EXTENSION_UUID, '', {});
        return;
    } catch (e) {}
    try {
        // Shell 45+ alternate
        const ext = Main.extensionManager.lookup(EXTENSION_UUID);
        if (ext && typeof ext.openPreferences === 'function') {
            ext.openPreferences();
            return;
        }
    } catch (e) {}
    try {
        GLib.spawn_command_line_async(
            `gnome-extensions prefs ${EXTENSION_UUID}`);
    } catch (e) {
        logError(e, 'material-panel: open prefs failed');
    }
}

function powerRow(menu = null) {
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
            if (menu) {
                try { menu.close(); } catch (e) {}
            }
        });
        row.add_child(btn);
    }
    return row;
}



/** QS Wi-Fi: compact full-width strip + optional saved-network list (sibling menu item). */
function wifiQsBlock() {
    const row = new St.BoxLayout({
        style_class: 'material-panel-qs-tile material-panel-qs-wifi-row',
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.FILL,
        height: 52,
        width: 148,
    });

    const mainBtn = new St.Button({
        style_class: 'material-panel-qs-wifi-main',
        reactive: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const mainBox = new St.BoxLayout({
        vertical: false,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        style_class: 'material-panel-qs-wifi-main-box',
    });
    const icon = new St.Icon({
        style_class: 'material-panel-qs-tile-icon',
        icon_size: 18,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('network-offline'))),
    });
    const textCol = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'material-panel-qs-wifi-text',
    });
    const text = new St.Label({
        text: 'Wi-Fi',
        style_class: 'material-panel-qs-tile-label',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    const speedLabel = new St.Label({
        text: '',
        style_class: 'material-panel-qs-wifi-speed',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    speedLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    speedLabel.visible = true;
    speedLabel.text = '↓ —  ↑ —';
    textCol.add_child(text);
    textCol.add_child(speedLabel);
    mainBox.add_child(icon);
    mainBox.add_child(textCol);
    mainBtn.set_child(mainBox);

    let _ssid = 'Wi-Fi';
    const stopNet = startNetSpeedMonitor(({downText, upText}) => {
        speedLabel.text = `↓ ${downText}  ↑ ${upText}`;
    });
    row.connect('destroy', () => { try { stopNet(); } catch (e) {} });

    const dropBtn = new St.Button({
        style_class: 'material-panel-qs-wifi-drop',
        reactive: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const dropIcon = new St.Icon({
        icon_name: 'pan-down-symbolic',
        icon_size: 14,
        y_align: Clutter.ActorAlign.CENTER,
    });
    dropBtn.set_child(dropIcon);
    row.add_child(mainBtn);
    row.add_child(dropBtn);

    const listPanel = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-wifi-panel',
    });
    listPanel.visible = false;

    let expanded = false;
    let client = null;

    const setActive = on => {
        if (on)
            row.add_style_class_name('active');
        else
            row.remove_style_class_name('active');
        const key = on ? 'network-wifi' : 'network-offline';
        try {
            icon.gicon = Gio.FileIcon.new(
                Gio.File.new_for_path(on ? iconPathOnAccent(key) : iconPath(key)));
        } catch (e) {}
        // Chevron uses on-primary (onAccent) when tile is active
        try {
            if (on) {
                dropBtn.add_style_class_name('active-drop');
                dropIcon.add_style_class_name('on-accent');
            } else {
                dropBtn.remove_style_class_name('active-drop');
                dropIcon.remove_style_class_name('on-accent');
            }
        } catch (e) {}
    };

    const rebuildList = () => {
        listPanel.destroy_all_children();
        if (!client) {
            listPanel.add_child(new St.Label({
                text: 'NetworkManager unavailable',
                style_class: 'material-panel-qs-bt-empty',
            }));
            return;
        }
        if (!client.wireless_enabled) {
            listPanel.add_child(new St.Label({
                text: 'Wi-Fi is off',
                style_class: 'material-panel-qs-bt-empty',
            }));
            return;
        }
        const activeId = client.get_primary_connection()?.get_uuid?.() ?? null;
        const wifiConnections = client.get_connections()
            .filter(c => c.get_connection_type() === NM.SETTING_WIRELESS_SETTING_NAME);
        if (wifiConnections.length === 0) {
            listPanel.add_child(new St.Label({
                text: 'No saved networks',
                style_class: 'material-panel-qs-bt-empty',
            }));
        } else {
            listPanel.add_child(new St.Label({
                text: 'Networks',
                style_class: 'material-panel-qs-list-header',
            }));
            for (const conn of wifiConnections) {
                const isActive = conn.get_uuid() === activeId;
                const btn = new St.Button({
                    style_class: `material-panel-qs-bt-device${isActive ? ' connected' : ''}`,
                    reactive: true,
                    x_expand: true,
                });
                const box = new St.BoxLayout({x_expand: true, y_align: Clutter.ActorAlign.CENTER});
                const name = new St.Label({
                    text: conn.get_id(),
                    style_class: 'material-panel-qs-bt-device-name',
                    x_expand: true,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                name.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                const status = new St.Label({
                    text: isActive ? (speedLabel.text || 'Connected') : 'Saved',
                    style_class: 'material-panel-qs-bt-device-status',
                    y_align: Clutter.ActorAlign.CENTER,
                });
                box.add_child(name);
                box.add_child(status);
                btn.set_child(box);
                btn.connect('clicked', () => {
                    if (isActive)
                        return Clutter.EVENT_STOP;
                    const device = client.get_devices()
                        .find(d => d.get_device_type() === NM.DeviceType.WIFI);
                    if (!device)
                        return Clutter.EVENT_STOP;
                    client.activate_connection_async(conn, device, null, null, (c, res) => {
                        try { client.activate_connection_finish(res); } catch (e) {
                            logError(e, 'material-panel: QS Wi-Fi activate failed');
                        }
                        rebuildList();
                    });
                    return Clutter.EVENT_STOP;
                });
                listPanel.add_child(btn);
            }
        }
        const settingsBtn = new St.Button({
            style_class: 'material-panel-qs-bt-device',
            reactive: true,
            x_expand: true,
        });
        settingsBtn.set_child(new St.Label({
            text: 'Wi-Fi settings…',
            style_class: 'material-panel-qs-bt-device-name',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        settingsBtn.connect('clicked', () => {
            try { GLib.spawn_command_line_async('gnome-control-center wifi'); }
            catch (e) {
                try { GLib.spawn_command_line_async('gnome-control-center network'); } catch (e2) {}
            }
            return Clutter.EVENT_STOP;
        });
        listPanel.add_child(settingsBtn);
    };

    const setExpanded = v => {
        expanded = !!v;
        listPanel.visible = expanded;
        dropIcon.icon_name = expanded ? 'pan-up-symbolic' : 'pan-down-symbolic';
        const parent = listPanel.get_parent();
        if (parent)
            parent.visible = expanded;
        if (expanded)
            rebuildList();
    };

    dropBtn.connect('clicked', () => {
        if (expanded)
            getQsExpandController().expandOnly(null);
        else
            getQsExpandController().expandOnly('wifi');
        return Clutter.EVENT_STOP;
    });
    getQsExpandController().register('wifi', {setExpanded});
    row.connect('destroy', () => getQsExpandController().unregister('wifi'));
    mainBtn.connect('clicked', () => {
        if (!client)
            return Clutter.EVENT_STOP;
        try { client.wireless_enabled = !client.wireless_enabled; } catch (e) {
            logError(e, 'material-panel: QS Wi-Fi toggle failed');
        }
        return Clutter.EVENT_STOP;
    });

    NM.Client.new_async(null, (_obj, res) => {
        try {
            client = NM.Client.new_finish(res);
        } catch (e) {
            logError(e, 'material-panel: QS NM unavailable');
            text.text = 'No Wi-Fi';
            return;
        }
        const sync = () => {
            const on = !!client.wireless_enabled;
            setActive(on);
            const conn = client.get_primary_connection();
            if (on) {
                if (conn?.get_connection_type?.() === NM.SETTING_WIRELESS_SETTING_NAME)
                    _ssid = conn.get_id?.() || 'Wi-Fi';
                else
                    _ssid = 'Wi-Fi';
                text.text = _ssid;
                speedLabel.visible = true;
                if (!speedLabel.text || speedLabel.text === '')
                    speedLabel.text = '↓ —  ↑ —';
            } else {
                _ssid = 'Wi-Fi';
                text.text = 'Wi-Fi';
                speedLabel.visible = false;
                speedLabel.text = '';
            }
            if (expanded)
                rebuildList();
        };
        sync();
        client.connect('notify::wireless-enabled', sync);
        client.connect('notify::primary-connection', sync);
        client.connect('connection-added', () => { if (expanded) rebuildList(); });
        client.connect('connection-removed', () => { if (expanded) rebuildList(); });
    });

    row.listPanel = listPanel;
    return row;
}

export function buildQuickSettings(_extensionPath, scale = 1.0) {
    const button = new St.Button({
        style_class: 'material-panel-quicksettings-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            icon_size: Math.round(17 * scale),
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('quicksettings'))),
        }),
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-qs-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    // Section: identity + media
    menu.addMenuItem(wrapAsMenuItem(qsSection(
        null,
        buildProfileCard({
            onPrefs: () => {
                openExtensionPrefs();
                try { menu.close(); } catch (e) {}
            },
        }),
        buildMediaPlayerRow(),
    )));

    // Section: volume + brightness
    menu.addMenuItem(wrapAsMenuItem(qsSection(
        'material-panel-qs-section-sliders',
        volumeSliderRow(),
        brightnessSliderRow(),
    )));

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // 2-column grid: every tile is 1×1 (same size). Order left→right, top→bottom.
    //   [ Dark ] [ DND  ]
    //   [ Night] [ BT   ]
    //   [ Wi-Fi] [      ]  ← empty cell ok; Wi-Fi same footprint as others
    const grid = new St.Widget({
        style_class: 'material-panel-qs-grid',
        x_expand: true,
        layout_manager: new Clutter.GridLayout({
            column_homogeneous: true,
            row_homogeneous: true,
            column_spacing: 8,
            row_spacing: 8,
        }),
    });
    const gl = grid.layout_manager;
    const tiles = [
        darkModeTile(),
        dndTile(),
        nightLightTile(),
        bluetoothTile(),
        wifiQsBlock(),
    ];
    const btTile = tiles[3];
    const wifiRow = tiles[4];
    tiles.forEach((tile, i) => {
        gl.attach(tile, i % 2, Math.floor(i / 2), 1, 1);
    });

    menu.addMenuItem(wrapAsMenuItem(qsSection(null, grid)));

    // Expand panels under grid (not part of cell size)
    if (btTile.devicePanel) {
        const devicesItem = wrapAsMenuItem(btTile.devicePanel);
        devicesItem.visible = false;
        menu.addMenuItem(devicesItem);
    }
    if (wifiRow.listPanel) {
        const wifiListItem = wrapAsMenuItem(wifiRow.listPanel);
        wifiListItem.visible = false;
        menu.addMenuItem(wifiListItem);
    }

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    menu.addMenuItem(wrapAsMenuItem(qsSection(
        'material-panel-qs-section-power',
        powerRow(menu),
    )));

    menu.connect('open-state-changed', (_m, open) => {
        if (!open)
            getQsExpandController().expandOnly(null);
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menu.close();
        else
            menu.open();
    });
    button.connect('destroy', () => menu.destroy());

    return button;
}
