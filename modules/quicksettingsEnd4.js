/**
 * End-4 Quick Settings — built from scratch.
 * Does NOT import modules/quicksettings.js (default QS).
 *
 * Structure (matches end-4 sidebarRight):
 *   header · dual volume/brightness · toggle grid · notifications · calendar · power
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';
import {createSlider} from '../lib/simpleSlider.js';
import {getMixerControl} from '../lib/audio.js';
import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {buildEnd4NotiSection, buildEnd4CalendarSection} from '../lib/end4QsExtras.js';

const UUID = 'material-panel@SakibShahariar';

// ── helpers ──────────────────────────────────────────────────────────

function style(actor, css) {
    try { actor.style = css; } catch (e) {}
}

function icon(key, size = 18) {
    return new St.Icon({
        icon_size: size,
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath(key))),
    });
}

function wrapShell(child) {
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    try { item.set_style('padding: 0; margin: 0;'); } catch (e) {}
    item.add_child(child);
    return item;
}

function openPrefs() {
    try {
        GLib.spawn_command_line_async(`gnome-extensions prefs ${UUID}`);
    } catch (e) {}
}

// ── dual volume + brightness capsule ─────────────────────────────────

function buildDualSliders() {
    const row = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        style_class: 'material-panel-e4-dual',
    });
    style(row, 'background-color: rgba(255,255,255,0.08); border-radius: 999px; padding: 6px 10px; spacing: 10px;');

    // Volume
    const volBox = new St.BoxLayout({vertical: false, x_expand: true, style_class: 'material-panel-e4-vol'});
    const volIcon = icon('volume-high', 16);
    volBox.add_child(volIcon);

    let sink = null;
    let control = null;
    const volSlider = createSlider({
        initialValue: 0.7,
        onChange: value => {
            const pct = Math.round(value * 100);
            try {
                if (sink && control) {
                    if (sink.is_muted && value > 0)
                        sink.change_is_muted(false);
                    sink.volume = Math.round(value * control.get_vol_max_norm());
                    sink.push_volume();
                }
            } catch (e) {}
            try {
                const key = pct === 0 ? 'volume-muted' : pct < 33 ? 'volume-low' : pct < 66 ? 'volume-medium' : 'volume-high';
                volIcon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPath(key)));
            } catch (e) {}
        },
    });
    volBox.add_child(volSlider.actor);
    row.add_child(volBox);

    try {
        control = getMixerControl();
        const bind = () => {
            try {
                sink = control.get_default_sink?.() ?? null;
                if (!sink) return;
                const max = control.get_vol_max_norm();
                const v = max > 0 ? sink.volume / max : 0;
                volSlider.setValue?.(v) ?? (volSlider.actor.value = v);
            } catch (e) {}
        };
        if (control) {
            control.connect('state-changed', bind);
            control.connect('default-sink-changed', bind);
            bind();
        }
    } catch (e) {}

    // Brightness
    const briBox = new St.BoxLayout({vertical: false, x_expand: true, style_class: 'material-panel-e4-bri'});
    const briIcon = icon('brightness', 16);
    // fallback if no brightness icon
    try {
        if (!Gio.File.new_for_path(iconPath('brightness')).query_exists(null))
            briIcon.icon_name = 'display-brightness-symbolic';
    } catch (e) {
        try { briIcon.icon_name = 'display-brightness-symbolic'; } catch (e2) {}
    }
    briBox.add_child(briIcon);

    let maxB = 100;
    try {
        const [ok, out] = GLib.spawn_command_line_sync('brightnessctl max');
        if (ok)
            maxB = parseInt(new TextDecoder().decode(out).trim(), 10) || 100;
    } catch (e) {}
    let curB = 50;
    try {
        const [ok, out] = GLib.spawn_command_line_sync('brightnessctl get');
        if (ok)
            curB = parseInt(new TextDecoder().decode(out).trim(), 10) || 50;
    } catch (e) {}

    const briSlider = createSlider({
        initialValue: Math.min(1, Math.max(0, curB / maxB)),
        onChange: value => {
            const pct = Math.max(1, Math.round(value * 100));
            try {
                GLib.spawn_command_line_async(`brightnessctl set ${pct}%`);
            } catch (e) {}
        },
    });
    briBox.add_child(briSlider.actor);
    row.add_child(briBox);

    return row;
}

// ── toggle tile ──────────────────────────────────────────────────────

function makeToggle({label, iconKey, getOn, setOn, round = false}) {
    const btn = new St.Button({
        style_class: 'material-panel-e4-toggle',
        reactive: true,
        x_expand: true,
        can_focus: true,
    });
    style(btn, round
        ? 'border-radius: 999px; min-height: 56px; min-width: 56px; padding: 10px;'
        : 'border-radius: 18px; min-height: 56px; padding: 10px 12px;');

    const box = new St.BoxLayout({
        vertical: !round,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    const ic = icon(iconKey, 20);
    box.add_child(ic);
    let lab = null;
    if (label && !round) {
        lab = new St.Label({
            text: label,
            y_align: Clutter.ActorAlign.CENTER,
        });
        style(lab, 'font-size: 12px; font-weight: 650;');
        box.add_child(lab);
    }
    btn.set_child(box);

    const paint = () => {
        let on = false;
        try { on = !!getOn(); } catch (e) {}
        if (on) {
            style(btn, (round
                ? 'border-radius: 999px; min-height: 56px; min-width: 56px; padding: 10px;'
                : 'border-radius: 18px; min-height: 56px; padding: 10px 12px;')
                + ' background-color: #f5b8d0;');
            if (lab)
                style(lab, 'font-size: 12px; font-weight: 700; color: #1a1a1a;');
        } else {
            style(btn, (round
                ? 'border-radius: 999px; min-height: 56px; min-width: 56px; padding: 10px; background-color: rgba(255,255,255,0.08);'
                : 'border-radius: 18px; min-height: 56px; padding: 10px 12px; background-color: rgba(255,255,255,0.08);'));
            if (lab)
                style(lab, 'font-size: 12px; font-weight: 650; color: #e8e0f0;');
        }
    };

    btn.connect('clicked', () => {
        try {
            const on = !!getOn();
            setOn(!on);
        } catch (e) {}
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            paint();
            return GLib.SOURCE_REMOVE;
        });
    });
    paint();
    return btn;
}

function buildToggleGrid() {
    const grid = new St.Widget({
        x_expand: true,
        style_class: 'material-panel-e4-grid',
        layout_manager: new Clutter.GridLayout({
            column_homogeneous: true,
            row_homogeneous: true,
            column_spacing: 8,
            row_spacing: 8,
        }),
    });
    const gl = grid.layout_manager;

    // Dark mode
    const schema = 'org.gnome.desktop.interface';
    const settings = new Gio.Settings({schema_id: schema});
    const dark = makeToggle({
        label: 'Dark mode',
        iconKey: 'darkmode',
        getOn: () => {
            try {
                return settings.get_string('color-scheme') === 'prefer-dark';
            } catch (e) {
                return false;
            }
        },
        setOn: on => {
            try {
                settings.set_string('color-scheme', on ? 'prefer-dark' : 'prefer-light');
            } catch (e) {}
        },
    });

    // DND
    let dndSettings = null;
    try {
        dndSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
    } catch (e) {}
    const dnd = makeToggle({
        label: 'Do not disturb',
        iconKey: 'dnd',
        getOn: () => {
            try {
                return dndSettings ? !dndSettings.get_boolean('show-banners') : false;
            } catch (e) {
                return false;
            }
        },
        setOn: on => {
            try {
                dndSettings?.set_boolean('show-banners', !on);
            } catch (e) {}
        },
    });

    // Night light
    let nlSettings = null;
    try {
        nlSettings = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.color'});
    } catch (e) {}
    const night = makeToggle({
        label: 'Night light',
        iconKey: 'nightlight',
        getOn: () => {
            try {
                return nlSettings?.get_boolean('night-light-enabled') ?? false;
            } catch (e) {
                return false;
            }
        },
        setOn: on => {
            try {
                nlSettings?.set_boolean('night-light-enabled', on);
            } catch (e) {}
        },
    });

    // Wi-Fi power (round)
    const wifi = makeToggle({
        label: null,
        iconKey: 'network-wifi',
        round: true,
        getOn: () => {
            try {
                const [ok, out] = GLib.spawn_command_line_sync('nmcli -t -f WIFI g');
                if (!ok) return false;
                return new TextDecoder().decode(out).trim().toLowerCase().includes('enabled');
            } catch (e) {
                return false;
            }
        },
        setOn: on => {
            try {
                GLib.spawn_command_line_async(on ? 'nmcli radio wifi on' : 'nmcli radio wifi off');
            } catch (e) {}
        },
    });

    // Bluetooth power
    const bt = makeToggle({
        label: 'Bluetooth',
        iconKey: 'bluetooth',
        getOn: () => {
            try {
                const [ok, out] = GLib.spawn_command_line_sync('bluetoothctl show');
                if (!ok) return false;
                return new TextDecoder().decode(out).includes('Powered: yes');
            } catch (e) {
                return false;
            }
        },
        setOn: on => {
            try {
                GLib.spawn_command_line_async(on ? 'bluetoothctl power on' : 'bluetoothctl power off');
            } catch (e) {}
        },
    });

    gl.attach(wifi, 0, 0, 1, 1);
    gl.attach(bt, 1, 0, 1, 1);
    gl.attach(dark, 0, 1, 1, 1);
    gl.attach(dnd, 1, 1, 1, 1);
    gl.attach(night, 0, 2, 1, 1);

    return grid;
}

// ── header ───────────────────────────────────────────────────────────

function buildHeader(menu) {
    const row = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        style_class: 'material-panel-e4-hdr',
    });
    style(row, 'spacing: 8px; padding: 2px 0;');

    // Uptime pill
    const uptime = new St.Label({
        text: 'Up —',
        style_class: 'material-panel-e4-uptime',
        y_align: Clutter.ActorAlign.CENTER,
    });
    style(uptime, 'background-color: rgba(255,255,255,0.08); border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 600;');
    row.add_child(uptime);

    const refreshUptime = () => {
        try {
            const [ok, out] = GLib.spawn_command_line_sync('cat /proc/uptime');
            if (!ok) return;
            const secs = parseFloat(new TextDecoder().decode(out).split(' ')[0]);
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            uptime.text = h > 0 ? `Up ${h}h ${m}m` : `Up ${m}m`;
        } catch (e) {}
    };
    refreshUptime();

    const spacer = new St.Widget({x_expand: true});
    row.add_child(spacer);

    const mkIconBtn = (iconName, onClick) => {
        const b = new St.Button({
            reactive: true,
            style_class: 'material-panel-e4-iconbtn',
        });
        style(b, 'width: 34px; height: 34px; border-radius: 999px; background-color: rgba(255,255,255,0.08);');
        const ic = new St.Icon({icon_name: iconName, icon_size: 16});
        b.set_child(ic);
        b.connect('clicked', () => {
            try { onClick(); } catch (e) {}
        });
        return b;
    };

    row.add_child(mkIconBtn('document-edit-symbolic', openPrefs));
    row.add_child(mkIconBtn('emblem-system-symbolic', openPrefs));
    row.add_child(mkIconBtn('system-shutdown-symbolic', () => {
        try { GLib.spawn_command_line_async('gnome-session-quit --power-off'); } catch (e) {}
        try { menuClose(menu); } catch (e) {}
    }));

    // Battery %
    const batt = new St.Label({
        text: '—%',
        y_align: Clutter.ActorAlign.CENTER,
    });
    style(batt, 'background-color: rgba(255,255,255,0.08); border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700;');
    row.add_child(batt);
    try {
        const [ok, out] = GLib.spawn_command_line_sync('cat /sys/class/power_supply/BAT0/capacity');
        if (ok)
            batt.text = `${new TextDecoder().decode(out).trim()}%`;
    } catch (e) {
        try {
            const [ok, out] = GLib.spawn_command_line_sync('cat /sys/class/power_supply/BAT1/capacity');
            if (ok)
                batt.text = `${new TextDecoder().decode(out).trim()}%`;
        } catch (e2) {}
    }

    return row;
}

// ── power row ────────────────────────────────────────────────────────

function buildPowerRow(menu) {
    const row = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        style_class: 'material-panel-e4-power',
    });
    style(row, 'spacing: 10px;');

    const actions = [
        {icon: 'system-lock-screen-symbolic', cmd: 'loginctl lock-session'},
        {icon: 'night-light-symbolic', cmd: null}, // placeholder
        {icon: 'view-refresh-symbolic', cmd: 'systemctl reboot'},
        {icon: 'system-shutdown-symbolic', cmd: 'systemctl poweroff'},
    ];
    for (const a of actions) {
        const b = new St.Button({
            reactive: true,
            x_expand: true,
            style_class: 'material-panel-e4-power-btn',
        });
        style(b, 'border-radius: 999px; min-height: 48px; background-color: rgba(255,255,255,0.08);');
        b.set_child(new St.Icon({icon_name: a.icon, icon_size: 18}));
        b.connect('clicked', () => {
            if (a.cmd) {
                try { GLib.spawn_command_line_async(a.cmd); } catch (e) {}
            }
            try { menuClose(menu); } catch (e) {}
        });
        row.add_child(b);
    }
    return row;
}

// ── main entry ───────────────────────────────────────────────────────

export function buildQuickSettingsEnd4(_extensionPath, scale = 1.0) {
    const qsIcon = new St.Icon({
        icon_size: Math.round(17 * scale),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('quicksettings'))),
    });
    const button = new St.Button({
        style_class: 'material-panel-quicksettings-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        child: qsIcon,
    });

    const menu = new PopupMenu.PopupMenu(button, 1.0, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-e4qs-menu material-panel-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const shell = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-e4qs-shell',
    });
    style(shell, 'min-width: 360px; max-width: 400px; padding: 14px; spacing: 12px; border-radius: 24px;');

    // 1 Header
    shell.add_child(buildHeader(menu));
    // 2 Dual sliders
    shell.add_child(buildDualSliders());
    // 3 Toggles
    shell.add_child(buildToggleGrid());
    // 4 Power
    shell.add_child(buildPowerRow(menu));
    // 5 Notifications
    try {
        shell.add_child(buildEnd4NotiSection());
    } catch (e) {
        logError(e, 'material-panel: e4 noti');
    }
    // 6 Calendar
    try {
        shell.add_child(buildEnd4CalendarSection());
    } catch (e) {
        logError(e, 'material-panel: e4 cal');
    }

    menu.addMenuItem(wrapShell(shell));

    menu.connect('open-state-changed', (_m, open) => {
        if (!open)
            return;
        try {
            const mon = Main.layoutManager.primaryMonitor;
            if (mon) {
                const maxH = Math.floor(mon.height * 0.88);
                menu.box.style = `max-height: ${maxH}px; min-width: 360px; border-radius: 24px;`;
                menu.box.clip_to_allocation = true;
            }
        } catch (e) {}
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else
            menuOpen(menu);
    });
    button.connect('destroy', () => {
        try { menu.destroy(); } catch (e) {}
    });

    try {
        log('material-panel: End-4 QS from-scratch (no default QS imports)');
    } catch (e) {}

    return button;
}
