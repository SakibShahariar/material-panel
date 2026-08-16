import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Gvc from 'gi://Gvc';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {createSlider} from '../lib/simpleSlider.js';

import {iconPath, iconPathOnAccent} from '../lib/iconTheme.js';

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

    const iconKeyFor = pct => {
        if (pct === 0) return 'volume-muted';
        if (pct >= 66) return 'volume-high';
        if (pct >= 33) return 'volume-medium';
        return 'volume-low';
    };

    const slider = createSlider({
        initialValue: 0,
        onChange: value => {
            if (sink)
                sink.volume = value * control.get_vol_max_norm();
            icon.gicon = Gio.FileIcon.new(
                Gio.File.new_for_path(iconPath(iconKeyFor(Math.round(value * 100)))));
        },
    });
    row.add_child(slider.actor);

    try {
        control = new Gvc.MixerControl({name: 'material-panel'});
        control.open();
    } catch (e) {
        logError(e, 'material-panel: Gvc unavailable, volume slider disabled');
        slider.actor.reactive = false;
        return row;
    }

    const syncFromSink = () => {
        if (!sink)
            return;
        const pct = sink.volume / control.get_vol_max_norm();
        slider.setValue(pct);
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath(iconKeyFor(Math.round(pct * 100)))));
    };

    const attachSink = () => {
        sink = control.get_default_sink();
        if (sink) {
            sink.connect('notify::volume', syncFromSink);
            syncFromSink();
        }
    };
    control.connect('state-changed', (_c, state) => {
        if (state === Gvc.MixerControlState.READY)
            attachSink();
    });
    control.connect('default-sink-changed', attachSink);

    return row;
}

// Brightness via GNOME Settings Daemon's D-Bus property - same
// Get/Set-over-Properties pattern used for the bluetooth adapter toggle.
// This is the piece I have the least confidence in getting right first
// try (interface/property names from memory, not verified against a
// running system) - if it silently does nothing, that's the first place
// to look.
function brightnessSliderRow() {
    const row = new St.BoxLayout({style_class: 'material-panel-qs-slider-row', x_expand: true});
    const icon = new St.Icon({
        style_class: 'material-panel-qs-slider-icon',
        icon_size: 18,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('brightness'))),
    });
    row.add_child(icon);

    const IFACE = 'org.gnome.SettingsDaemon.Power.Screen';
    let proxy = null;

    const slider = createSlider({
        initialValue: 0.5,
        onChange: value => {
            if (!proxy)
                return;
            proxy.call('Set', new GLib.Variant('(ssv)',
                [IFACE, 'Brightness', new GLib.Variant('i', Math.round(value * 100))]),
                Gio.DBusCallFlags.NONE, -1, null, () => {});
        },
    });
    row.add_child(slider.actor);

    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
        'org.gnome.SettingsDaemon.Power', '/org/gnome/SettingsDaemon/Power',
        'org.freedesktop.DBus.Properties', null,
        (_s, res) => {
            try {
                proxy = Gio.DBusProxy.new_for_bus_finish(res);
            } catch (e) {
                logError(e, 'material-panel: brightness D-Bus service unavailable, slider disabled');
                slider.actor.reactive = false;
                return;
            }

            proxy.call('Get', new GLib.Variant('(ss)', [IFACE, 'Brightness']),
                Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                    try {
                        const [variant] = p.call_finish(r).deep_unpack();
                        slider.setValue(variant.deep_unpack() / 100);
                    } catch (e) {
                        logError(e, 'material-panel: brightness Get failed - property/interface name may be wrong');
                        slider.actor.reactive = false;
                    }
                });

            proxy.connect('g-signal', (_p, _sender, signal, params) => {
                if (signal !== 'PropertiesChanged')
                    return;
                const [iface, changed] = params.deep_unpack();
                if (iface === IFACE && 'Brightness' in changed)
                    slider.setValue(changed['Brightness'].deep_unpack() / 100);
            });
        });

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
function bluetoothTile() {
    const tile = new St.Button({style_class: 'material-panel-qs-tile', reactive: true, x_expand: true});
    const box = new St.BoxLayout({vertical: false, style_class: 'material-panel-qs-tile-content', y_align: Clutter.ActorAlign.CENTER});
    const icon = new St.Icon({
        style_class: 'material-panel-qs-tile-icon', icon_size: 18, y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('bluetooth-off'))),
    });
    const text = makeWrappingLabel('Bluetooth', 'material-panel-qs-tile-label');
    text.x_expand = true;
    box.add_child(icon);
    box.add_child(text);
    tile.set_child(box);

    const BLUEZ_SERVICE = 'org.bluez';
    const ADAPTER_IFACE = 'org.bluez.Adapter1';
    let propsProxy = null;
    let currentlyPowered = false;

    const setPowered = powered => {
        currentlyPowered = powered;
        const key = powered ? 'bluetooth-on' : 'bluetooth-off';
        icon.gicon = Gio.FileIcon.new(
            Gio.File.new_for_path(powered ? iconPathOnAccent(key) : iconPath(key)));
        tile.set_style_class_name(`material-panel-qs-tile${powered ? ' active' : ''}`);
    };

    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
        BLUEZ_SERVICE, '/', 'org.freedesktop.DBus.ObjectManager', null,
        (_s, res) => {
            let objMgr;
            try {
                objMgr = Gio.DBusProxy.new_for_bus_finish(res);
            } catch (e) {
                logError(e, 'material-panel: bluez unavailable');
                return;
            }
            objMgr.call('GetManagedObjects', null, Gio.DBusCallFlags.NONE, -1, null, (proxy, callRes) => {
                try {
                    const [objects] = proxy.call_finish(callRes).deep_unpack();
                    const path = Object.keys(objects).find(p => ADAPTER_IFACE in objects[p]);
                    if (!path)
                        return;
                    Gio.DBusProxy.new_for_bus(
                        Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
                        BLUEZ_SERVICE, path, 'org.freedesktop.DBus.Properties', null,
                        (_s2, res2) => {
                            try {
                                propsProxy = Gio.DBusProxy.new_for_bus_finish(res2);
                            } catch (e) {
                                logError(e, 'material-panel: bluez properties proxy failed');
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
                            tile.connect('clicked', () => {
                                propsProxy.call('Set', new GLib.Variant('(ssv)',
                                    [ADAPTER_IFACE, 'Powered', new GLib.Variant('b', !currentlyPowered)]),
                                    Gio.DBusCallFlags.NONE, -1, null, () => {});
                            });
                        });
                } catch (e) {
                    logError(e, 'material-panel: bluez GetManagedObjects failed');
                }
            });
        });

    return tile;
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

export function buildQuickSettings() {
    const button = new St.Button({
        style_class: 'material-panel-quicksettings-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('settings'))),
        }),
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-qs-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();

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
