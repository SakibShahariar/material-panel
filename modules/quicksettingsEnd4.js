/**
 * End-4 Quick Settings — from scratch (no default QS imports).
 * Visual target: end-4 sidebarRight (header, dual slider, compact toggles, noti, calendar).
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';
import {createSlider} from '../lib/simpleSlider.js';
import {getMixerControl} from '../lib/audio.js';
import {iconPath, iconPathOnAccent, iconPathPrimary} from '../lib/iconTheme.js';
import {buildEnd4NotiSection, buildEnd4CalendarSection} from '../lib/end4QsExtras.js';

const UUID = 'material-panel@SakibShahariar';

function style(actor, css) {
    try { actor.style = css; } catch (e) {}
}

function loadGicon(key, onAccent = false) {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
        try {
            const p = onAccent ? iconPathOnAccent(k) : iconPath(k);
            if (Gio.File.new_for_path(p).query_exists(null))
                return Gio.FileIcon.new(Gio.File.new_for_path(p));
        } catch (e) {}
        try {
            const p = iconPath(k);
            if (Gio.File.new_for_path(p).query_exists(null))
                return Gio.FileIcon.new(Gio.File.new_for_path(p));
        } catch (e) {}
    }
    return null;
}

function makeIcon(keys, size = 18, onAccent = false, symbolicFallback = null) {
    const ic = new St.Icon({
        icon_size: size,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
    });
    const g = loadGicon(keys, onAccent);
    if (g)
        ic.gicon = g;
    else if (symbolicFallback)
        ic.icon_name = symbolicFallback;
    return ic;
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

// ── dual slider ──────────────────────────────────────────────────────

function buildDualSliders() {
    const row = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        style_class: 'material-panel-e4-dual',
    });
    style(row, 'background-color: rgba(255,255,255,0.10); border-radius: 999px; padding: 8px 12px; spacing: 12px;');

    const volBox = new St.BoxLayout({vertical: false, x_expand: true});
    const volIcon = makeIcon(['volume-high', 'volume-medium'], 16, false, 'audio-volume-high-symbolic');
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
            const key = pct === 0 ? 'volume-muted' : pct < 33 ? 'volume-low' : pct < 66 ? 'volume-medium' : 'volume-high';
            const g = loadGicon(key);
            if (g)
                volIcon.gicon = g;
        },
    });
    volBox.add_child(volSlider.actor);
    row.add_child(volBox);

    try {
        control = getMixerControl();
        const bind = () => {
            try {
                sink = control.get_default_sink?.() ?? null;
                if (!sink || !control)
                    return;
                const max = control.get_vol_max_norm();
                const v = max > 0 ? sink.volume / max : 0;
                if (typeof volSlider.setValue === 'function')
                    volSlider.setValue(v);
            } catch (e) {}
        };
        if (control) {
            try { control.connect('state-changed', bind); } catch (e) {}
            try { control.connect('default-sink-changed', bind); } catch (e) {}
            bind();
        }
    } catch (e) {}

    const briBox = new St.BoxLayout({vertical: false, x_expand: true});
    const briIcon = makeIcon(['brightness', 'weather-sunny'], 16, false, 'weather-clear-symbolic');
    try { briIcon.icon_name = 'weather-clear-symbolic'; } catch (e) {}
    briBox.add_child(briIcon);

    let maxB = 100;
    let curB = 50;
    try {
        const [ok, out] = GLib.spawn_command_line_sync('brightnessctl max');
        if (ok)
            maxB = parseInt(new TextDecoder().decode(out).trim(), 10) || 100;
    } catch (e) {}
    try {
        const [ok, out] = GLib.spawn_command_line_sync('brightnessctl get');
        if (ok)
            curB = parseInt(new TextDecoder().decode(out).trim(), 10) || 50;
    } catch (e) {}

    const briSlider = createSlider({
        initialValue: Math.min(1, Math.max(0.01, curB / maxB)),
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

// ── compact toggle ───────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} [opts.label]
 * @param {string} [opts.sub]
 * @param {string[]} opts.iconKeys
 * @param {string} [opts.symbolic]
 * @param {() => boolean} opts.getOn
 * @param {(v: boolean) => void} opts.setOn
 * @param {'round'|'wide'} [opts.kind]
 */
function makeToggle(opts) {
    const kind = opts.kind || 'wide';
    const btn = new St.Button({
        style_class: 'material-panel-e4-toggle',
        reactive: true,
        can_focus: true,
        x_expand: kind !== 'round',
    });

    const box = new St.BoxLayout({
        vertical: false,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: kind === 'round' ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
        x_expand: true,
    });
    style(box, kind === 'round' ? 'spacing: 0;' : 'spacing: 10px; padding: 0 4px;');

    const ic = makeIcon(opts.iconKeys, 20, false, opts.symbolic);
    box.add_child(ic);

    let title = null;
    let sub = null;
    if (kind !== 'round' && opts.label) {
        const col = new St.BoxLayout({vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        title = new St.Label({text: opts.label});
        style(title, 'font-size: 12px; font-weight: 700;');
        col.add_child(title);
        if (opts.sub) {
            sub = new St.Label({text: opts.sub});
            style(sub, 'font-size: 11px; opacity: 0.75;');
            col.add_child(sub);
        }
        box.add_child(col);
    }
    btn.set_child(box);

    const paint = () => {
        let on = false;
        try { on = !!opts.getOn(); } catch (e) {}

        if (kind === 'round') {
            style(btn, on
                ? 'border-radius: 999px; min-height: 52px; min-width: 52px; padding: 8px; background-color: #f5b8d0;'
                : 'border-radius: 999px; min-height: 52px; min-width: 52px; padding: 8px; background-color: rgba(255,255,255,0.10);');
        } else {
            style(btn, on
                ? 'border-radius: 18px; min-height: 52px; padding: 8px 12px; background-color: #f5b8d0;'
                : 'border-radius: 18px; min-height: 52px; padding: 8px 12px; background-color: rgba(255,255,255,0.10);');
        }

        const g = loadGicon(opts.iconKeys, on);
        if (g)
            ic.gicon = g;
        else if (opts.symbolic)
            ic.icon_name = opts.symbolic;

        if (title)
            style(title, on
                ? 'font-size: 12px; font-weight: 700; color: #1a1a1a;'
                : 'font-size: 12px; font-weight: 700; color: #eee6f4;');
        if (sub)
            style(sub, on
                ? 'font-size: 11px; color: #3a2a32;'
                : 'font-size: 11px; opacity: 0.7; color: #c8bdd0;');
    };

    btn.connect('clicked', () => {
        try {
            opts.setOn(!opts.getOn());
        } catch (e) {}
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            paint();
            return GLib.SOURCE_REMOVE;
        });
    });
    paint();
    return btn;
}

function buildToggleGrid() {
    const root = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-e4-grid',
    });
    style(root, 'spacing: 8px;');

    const iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    let dndSettings = null;
    try { dndSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'}); } catch (e) {}
    let nlSettings = null;
    try { nlSettings = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.color'}); } catch (e) {}

    // Row 0: circular Wi-Fi + Bluetooth (end-4 style)
    const row0 = new St.BoxLayout({vertical: false, x_expand: true});
    style(row0, 'spacing: 8px;');

    const wifi = makeToggle({
        kind: 'round',
        iconKeys: ['network-wifi'],
        symbolic: 'network-wireless-symbolic',
        getOn: () => {
            try {
                const [ok, out] = GLib.spawn_command_line_sync('nmcli -t -f WIFI g');
                return ok && new TextDecoder().decode(out).toLowerCase().includes('enabled');
            } catch (e) { return false; }
        },
        setOn: on => {
            try {
                GLib.spawn_command_line_async(on ? 'nmcli radio wifi on' : 'nmcli radio wifi off');
            } catch (e) {}
        },
    });
    try {
        wifi.width = 56;
        wifi.height = 56;
        wifi.x_expand = false;
    } catch (e) {}

    const bt = makeToggle({
        kind: 'wide',
        label: 'Bluetooth',
        sub: 'Tap to toggle',
        iconKeys: ['bluetooth-on', 'bluetooth-off'],
        symbolic: 'bluetooth-active-symbolic',
        getOn: () => {
            try {
                const [ok, out] = GLib.spawn_command_line_sync('bluetoothctl show');
                return ok && new TextDecoder().decode(out).includes('Powered: yes');
            } catch (e) { return false; }
        },
        setOn: on => {
            try {
                GLib.spawn_command_line_async(on ? 'bluetoothctl power on' : 'bluetoothctl power off');
            } catch (e) {}
        },
    });

    row0.add_child(wifi);
    row0.add_child(bt);
    root.add_child(row0);

    // Row 1: Dark | DND
    const row1 = new St.BoxLayout({vertical: false, x_expand: true});
    style(row1, 'spacing: 8px;');
    const dark = makeToggle({
        kind: 'wide',
        label: 'Dark mode',
        iconKeys: ['dark-mode', 'light-mode'],
        symbolic: 'weather-clear-night-symbolic',
        getOn: () => {
            try { return iface.get_string('color-scheme') === 'prefer-dark'; } catch (e) { return false; }
        },
        setOn: on => {
            try { iface.set_string('color-scheme', on ? 'prefer-dark' : 'prefer-light'); } catch (e) {}
        },
    });
    const dnd = makeToggle({
        kind: 'wide',
        label: 'Do not disturb',
        iconKeys: ['dnd-active', 'dnd-inactive'],
        symbolic: 'notifications-disabled-symbolic',
        getOn: () => {
            try { return dndSettings ? !dndSettings.get_boolean('show-banners') : false; } catch (e) { return false; }
        },
        setOn: on => {
            try { dndSettings?.set_boolean('show-banners', !on); } catch (e) {}
        },
    });
    row1.add_child(dark);
    row1.add_child(dnd);
    root.add_child(row1);

    // Row 2: Night light full width
    const night = makeToggle({
        kind: 'wide',
        label: 'Night light',
        iconKeys: ['night-light'],
        symbolic: 'night-light-symbolic',
        getOn: () => {
            try { return nlSettings?.get_boolean('night-light-enabled') ?? false; } catch (e) { return false; }
        },
        setOn: on => {
            try { nlSettings?.set_boolean('night-light-enabled', on); } catch (e) {}
        },
    });
    root.add_child(night);

    return root;
}

// ── header ───────────────────────────────────────────────────────────

function buildHeader(menu) {
    const row = new St.BoxLayout({vertical: false, x_expand: true});
    style(row, 'spacing: 6px;');

    const uptime = new St.Label({text: 'Up —', y_align: Clutter.ActorAlign.CENTER});
    style(uptime, 'background-color: rgba(255,255,255,0.10); border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 600;');
    row.add_child(uptime);
    try {
        const [ok, out] = GLib.spawn_command_line_sync('cat /proc/uptime');
        if (ok) {
            const secs = parseFloat(new TextDecoder().decode(out).split(' ')[0]);
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            uptime.text = h > 0 ? `Up ${h}h ${m}m` : `Up ${m}m`;
        }
    } catch (e) {}

    row.add_child(new St.Widget({x_expand: true}));

    const mkBtn = (symbolic, fn) => {
        const b = new St.Button({reactive: true});
        style(b, 'width: 32px; height: 32px; border-radius: 999px; background-color: rgba(255,255,255,0.10);');
        b.set_child(new St.Icon({icon_name: symbolic, icon_size: 14}));
        b.connect('clicked', () => { try { fn(); } catch (e) {} });
        return b;
    };
    row.add_child(mkBtn('document-edit-symbolic', openPrefs));
    row.add_child(mkBtn('emblem-system-symbolic', openPrefs));
    row.add_child(mkBtn('system-shutdown-symbolic', () => {
        try { GLib.spawn_command_line_async('gnome-session-quit --power-off'); } catch (e) {}
        try { menuClose(menu); } catch (e) {}
    }));

    const batt = new St.Label({text: '—%', y_align: Clutter.ActorAlign.CENTER});
    style(batt, 'background-color: rgba(255,255,255,0.10); border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700;');
    row.add_child(batt);
    for (const bat of ['BAT0', 'BAT1']) {
        try {
            const [ok, out] = GLib.spawn_command_line_sync(`cat /sys/class/power_supply/${bat}/capacity`);
            if (ok) {
                batt.text = `${new TextDecoder().decode(out).trim()}%`;
                break;
            }
        } catch (e) {}
    }
    return row;
}

function buildPowerRow(menu) {
    const row = new St.BoxLayout({vertical: false, x_expand: true});
    style(row, 'spacing: 8px;');
    const actions = [
        {icon: 'system-lock-screen-symbolic', cmd: 'loginctl lock-session'},
        {icon: 'night-light-symbolic', cmd: null},
        {icon: 'view-refresh-symbolic', cmd: 'systemctl reboot'},
        {icon: 'system-shutdown-symbolic', cmd: 'systemctl poweroff'},
    ];
    for (const a of actions) {
        const b = new St.Button({reactive: true, x_expand: true});
        style(b, 'border-radius: 999px; min-height: 40px; background-color: rgba(255,255,255,0.10);');
        b.set_child(new St.Icon({icon_name: a.icon, icon_size: 16}));
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
    style(shell, 'min-width: 300px; max-width: 320px; padding: 12px; spacing: 10px; border-radius: 22px;');

    shell.add_child(buildHeader(menu));
    shell.add_child(buildDualSliders());
    shell.add_child(buildToggleGrid());
    shell.add_child(buildPowerRow(menu));
    try { shell.add_child(buildEnd4NotiSection()); } catch (e) { logError(e, 'e4 noti'); }
    try {
        const cal = buildEnd4CalendarSection();
        shell.add_child(cal);
        log('material-panel: e4 calendar attached');
    } catch (e) { logError(e, 'material-panel: e4 cal failed'); }

    // Scroll so calendar is reachable (end-4 sidebar is tall)
    const scroll = new St.ScrollView({
        style_class: 'material-panel-e4qs-scroll',
        x_expand: true,
        y_expand: true,
        overlay_scrollbars: true,
    });
    try {
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    } catch (e) {
        try { scroll.hscrollbar_policy = 2; scroll.vscrollbar_policy = 1; } catch (e2) {}
    }
    try {
        if (scroll.add_actor)
            scroll.add_actor(shell);
        else
            scroll.set_child(shell);
    } catch (e) {
        try { scroll.add_child(shell); } catch (e2) {}
    }
    menu.addMenuItem(wrapShell(scroll));

    menu.connect('open-state-changed', (_m, open) => {
        if (!open)
            return;
        try {
            const mon = Main.layoutManager.primaryMonitor;
            if (mon) {
                menu.box.style = `max-height: ${Math.floor(mon.height * 0.88)}px; min-width: 300px; max-width: 320px; border-radius: 22px;`;
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
    button.connect('destroy', () => { try { menu.destroy(); } catch (e) {} });

    try { log('material-panel: End-4 QS from-scratch v2 (icons fixed)'); } catch (e) {}
    return button;
}
