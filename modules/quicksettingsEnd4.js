/**
 * End-4 QS — structured to match end-4 sidebarRight reference:
 *   header (uptime + icon actions + battery)
 *   dual volume|brightness capsule
 *   toggle grid (round + wide mix)
 *   notification cards
 *   calendar
 * No default QS imports.
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
const QS_W = 360;
const QS_PAD = 12;
const QS_INNER = QS_W - QS_PAD * 2;
const ACCENT = '#f5b8d0';
const SURFACE = 'rgba(255,255,255,0.10)';
const SURFACE2 = 'rgba(255,255,255,0.06)';

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
    try { item.set_style('padding: 0; margin: 0; min-width: 0;'); } catch (e) {}
    item.add_child(child);
    return item;
}

function openPrefs() {
    try {
        GLib.spawn_command_line_async(`gnome-extensions prefs ${UUID}`);
    } catch (e) {}
}

// ── Header (end-4: uptime | edit refresh settings power | battery badge) ──

function buildHeader(menu) {
    const row = new St.BoxLayout({vertical: false, x_expand: true});
    style(row, 'spacing: 6px;');

    const uptime = new St.Label({text: 'Up —', y_align: Clutter.ActorAlign.CENTER});
    style(uptime, `background-color: ${SURFACE}; border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 600;`);
    row.add_child(uptime);
    try {
        const [ok, out] = GLib.spawn_command_line_sync('cat /proc/uptime');
        if (ok) {
            const secs = parseFloat(new TextDecoder().decode(out).split(' ')[0]);
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            uptime.text = h > 0 ? `▲ Up ${h}h ${m}m` : `▲ Up ${m}m`;
        }
    } catch (e) {}

    row.add_child(new St.Widget({x_expand: true}));

    const mkBtn = (symbolic, fn) => {
        const b = new St.Button({reactive: true});
        style(b, `width: 30px; height: 30px; border-radius: 999px; background-color: ${SURFACE};`);
        b.set_child(new St.Icon({icon_name: symbolic, icon_size: 14}));
        b.connect('clicked', () => { try { fn(); } catch (e) {} });
        return b;
    };
    // end-4: edit, refresh-ish, settings, power
    row.add_child(mkBtn('document-edit-symbolic', openPrefs));
    row.add_child(mkBtn('view-refresh-symbolic', () => {
        try { Main.notify('material-panel', 'Quick Settings refreshed'); } catch (e) {}
    }));
    row.add_child(mkBtn('emblem-system-symbolic', openPrefs));
    row.add_child(mkBtn('system-shutdown-symbolic', () => {
        try { GLib.spawn_command_line_async('gnome-session-quit --power-off'); } catch (e) {}
        try { menuClose(menu); } catch (e) {}
    }));

    const batt = new St.Label({text: '—%', y_align: Clutter.ActorAlign.CENTER});
    style(batt, `background-color: ${SURFACE}; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700;`);
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

// ── Dual slider capsule (end-4 continuous bar) ──

function buildDualSliders() {
    const gap = 6;
    const iconSpace = 20;
    const divW = 2;
    const trackW = Math.floor((QS_INNER - 20 - gap * 3 - iconSpace * 2 - divW) / 2);

    const row = new St.BoxLayout({vertical: false, x_expand: false});
    style(row, `background-color: ${SURFACE}; border-radius: 999px; padding: 8px 10px; spacing: ${gap}px; width: ${QS_INNER}px;`);
    try { row.width = QS_INNER; } catch (e) {}

    const volBox = new St.BoxLayout({vertical: false});
    style(volBox, 'spacing: 6px;');
    const volIcon = makeIcon(['volume-high'], 16, false, 'audio-volume-high-symbolic');
    volBox.add_child(volIcon);

    let sink = null;
    let control = null;
    const volSlider = createSlider({
        initialValue: 0.7,
        width: trackW,
        onChange: value => {
            try {
                if (sink && control) {
                    if (sink.is_muted && value > 0)
                        sink.change_is_muted(false);
                    sink.volume = Math.round(value * control.get_vol_max_norm());
                    sink.push_volume();
                }
            } catch (e) {}
            const pct = Math.round(value * 100);
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
                if (typeof volSlider.setValue === 'function')
                    volSlider.setValue(max > 0 ? sink.volume / max : 0);
            } catch (e) {}
        };
        if (control) {
            try { control.connect('state-changed', bind); } catch (e) {}
            try { control.connect('default-sink-changed', bind); } catch (e) {}
            bind();
        }
    } catch (e) {}

    const div = new St.Widget();
    style(div, `width: ${divW}px; height: 14px; background-color: rgba(255,255,255,0.25);`);
    try { div.width = divW; div.height = 14; } catch (e) {}
    row.add_child(div);

    const briBox = new St.BoxLayout({vertical: false});
    style(briBox, 'spacing: 6px;');
    const briIcon = makeIcon(['brightness'], 16, false, 'weather-clear-symbolic');
    try { briIcon.icon_name = 'weather-clear-symbolic'; } catch (e) {}
    briBox.add_child(briIcon);

    let maxB = 100, curB = 50;
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
        width: trackW,
        onChange: value => {
            try {
                GLib.spawn_command_line_async(`brightnessctl set ${Math.max(1, Math.round(value * 100))}%`);
            } catch (e) {}
        },
    });
    briBox.add_child(briSlider.actor);
    row.add_child(briBox);

    return row;
}

// ── Toggles (end-4 style: round + labeled wide) ──

function makeRoundToggle({iconKeys, symbolic, getOn, setOn}) {
    const btn = new St.Button({reactive: true, can_focus: true, x_expand: false});
    const ic = makeIcon(iconKeys, 20, false, symbolic);
    btn.set_child(ic);

    const paint = () => {
        let on = false;
        try { on = !!getOn(); } catch (e) {}
        style(btn, on
            ? `border-radius: 999px; width: 52px; height: 52px; background-color: ${ACCENT};`
            : `border-radius: 999px; width: 52px; height: 52px; background-color: ${SURFACE};`);
        try { btn.width = 52; btn.height = 52; } catch (e) {}
        const g = loadGicon(iconKeys, on);
        if (g)
            ic.gicon = g;
        else if (symbolic)
            ic.icon_name = symbolic;
    };
    btn.connect('clicked', () => {
        try { setOn(!getOn()); } catch (e) {}
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            paint();
            return GLib.SOURCE_REMOVE;
        });
    });
    paint();
    return btn;
}

function makeWideToggle({label, sub, iconKeys, symbolic, getOn, setOn, width}) {
    const btn = new St.Button({reactive: true, can_focus: true, x_expand: false});
    const box = new St.BoxLayout({vertical: false, y_align: Clutter.ActorAlign.CENTER, x_expand: true});
    style(box, 'spacing: 10px; padding: 0 4px;');
    const ic = makeIcon(iconKeys, 18, false, symbolic);
    box.add_child(ic);
    const col = new St.BoxLayout({vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    const title = new St.Label({text: label});
    style(title, 'font-size: 12px; font-weight: 700;');
    col.add_child(title);
    let subLab = null;
    if (sub) {
        subLab = new St.Label({text: sub});
        style(subLab, 'font-size: 11px; opacity: 0.7;');
        col.add_child(subLab);
    }
    box.add_child(col);
    btn.set_child(box);

    const paint = () => {
        let on = false;
        try { on = !!getOn(); } catch (e) {}
        const w = width || 140;
        style(btn, on
            ? `border-radius: 18px; height: 52px; width: ${w}px; padding: 6px 10px; background-color: ${ACCENT};`
            : `border-radius: 18px; height: 52px; width: ${w}px; padding: 6px 10px; background-color: ${SURFACE};`);
        try { btn.width = w; btn.height = 52; } catch (e) {}
        const g = loadGicon(iconKeys, on);
        if (g)
            ic.gicon = g;
        else if (symbolic)
            ic.icon_name = symbolic;
        style(title, on
            ? 'font-size: 12px; font-weight: 700; color: #1a1a1a;'
            : 'font-size: 12px; font-weight: 700; color: #eee6f4;');
        if (subLab)
            style(subLab, on
                ? 'font-size: 11px; color: #3a2a32;'
                : 'font-size: 11px; opacity: 0.7; color: #c8bdd0;');
    };
    btn.connect('clicked', () => {
        try { setOn(!getOn()); } catch (e) {}
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            paint();
            return GLib.SOURCE_REMOVE;
        });
    });
    paint();
    return btn;
}

function buildToggleGrid() {
    const root = new St.BoxLayout({vertical: true, x_expand: false});
    style(root, `spacing: 8px; width: ${QS_INNER}px;`);
    try { root.width = QS_INNER; } catch (e) {}

    const iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    let dndSettings = null;
    try { dndSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'}); } catch (e) {}
    let nlSettings = null;
    try { nlSettings = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.color'}); } catch (e) {}

    // Row 0 — end-4: [WiFi●] [Bluetooth wide] [round]
    const row0 = new St.BoxLayout({vertical: false});
    style(row0, 'spacing: 8px;');
    const wifi = makeRoundToggle({
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
    let btSub = 'Tap to toggle';
    try {
        const [ok, out] = GLib.spawn_command_line_sync('bluetoothctl devices Connected');
        if (ok) {
            const lines = new TextDecoder().decode(out).trim().split('\n').filter(Boolean);
            btSub = lines.length ? lines[0].replace(/^Device\s+\S+\s+/, '').slice(0, 18) : 'Not connected';
        }
    } catch (e) {}
    const btW = QS_INNER - 52 - 52 - 16; // wifi + third round + gaps
    const bt = makeWideToggle({
        label: 'Bluetooth',
        sub: btSub,
        width: Math.max(120, btW),
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
    // Third round = Dark mode (maps to end-4 third tile)
    const darkRound = makeRoundToggle({
        iconKeys: ['dark-mode', 'light-mode'],
        symbolic: 'weather-clear-night-symbolic',
        getOn: () => {
            try { return iface.get_string('color-scheme') === 'prefer-dark'; } catch (e) { return false; }
        },
        setOn: on => {
            try { iface.set_string('color-scheme', on ? 'prefer-dark' : 'prefer-light'); } catch (e) {}
        },
    });
    row0.add_child(wifi);
    row0.add_child(bt);
    row0.add_child(darkRound);
    root.add_child(row0);

    // Row 1 — end-4 second row of rounds + status: Night light, DND as wide, lock as round
    const row1 = new St.BoxLayout({vertical: false});
    style(row1, 'spacing: 8px;');
    const night = makeRoundToggle({
        iconKeys: ['night-light'],
        symbolic: 'night-light-symbolic',
        getOn: () => {
            try { return nlSettings?.get_boolean('night-light-enabled') ?? false; } catch (e) { return false; }
        },
        setOn: on => {
            try { nlSettings?.set_boolean('night-light-enabled', on); } catch (e) {}
        },
    });
    const dndW = QS_INNER - 52 * 2 - 16;
    const dnd = makeWideToggle({
        label: 'Do not disturb',
        sub: 'Hide banners',
        width: Math.max(120, dndW),
        iconKeys: ['dnd-active', 'dnd-inactive'],
        symbolic: 'notifications-disabled-symbolic',
        getOn: () => {
            try { return dndSettings ? !dndSettings.get_boolean('show-banners') : false; } catch (e) { return false; }
        },
        setOn: on => {
            try { dndSettings?.set_boolean('show-banners', !on); } catch (e) {}
        },
    });
    const lockBtn = makeRoundToggle({
        iconKeys: ['lock'],
        symbolic: 'system-lock-screen-symbolic',
        getOn: () => false,
        setOn: () => {
            try { GLib.spawn_command_line_async('loginctl lock-session'); } catch (e) {}
        },
    });
    // Force lock to use symbolic always
    try {
        lockBtn.get_child().icon_name = 'system-lock-screen-symbolic';
    } catch (e) {}
    row1.add_child(night);
    row1.add_child(dnd);
    row1.add_child(lockBtn);
    root.add_child(row1);

    return root;
}

// ── Power strip (compact, under toggles — end-4 puts some in header; keep reboot/power) ──

function buildPowerStrip(menu) {
    const row = new St.BoxLayout({vertical: false, x_expand: false});
    const gap = 8;
    const n = 3;
    const btnW = Math.floor((QS_INNER - gap * (n - 1)) / n);
    style(row, `spacing: ${gap}px; width: ${QS_INNER}px;`);
    try { row.width = QS_INNER; } catch (e) {}
    const actions = [
        {icon: 'system-log-out-symbolic', cmd: 'gnome-session-quit --logout --no-prompt'},
        {icon: 'view-refresh-symbolic', cmd: 'systemctl reboot'},
        {icon: 'system-shutdown-symbolic', cmd: 'systemctl poweroff'},
    ];
    for (const a of actions) {
        const b = new St.Button({reactive: true, x_expand: false});
        style(b, `border-radius: 999px; height: 42px; width: ${btnW}px; background-color: ${SURFACE};`);
        try { b.width = btnW; b.height = 42; } catch (e) {}
        b.set_child(new St.Icon({
            icon_name: a.icon,
            icon_size: 16,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        b.connect('clicked', () => {
            try { GLib.spawn_command_line_async(a.cmd); } catch (e) {}
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
        x_expand: false,
        style_class: 'material-panel-e4qs-shell',
    });
    style(shell, `width: ${QS_W}px; min-width: ${QS_W}px; max-width: ${QS_W}px; padding: ${QS_PAD}px; spacing: 10px; border-radius: 22px;`);

    shell.add_child(buildHeader(menu));
    shell.add_child(buildDualSliders());
    shell.add_child(buildToggleGrid());
    shell.add_child(buildPowerStrip(menu));
    try { shell.add_child(buildEnd4NotiSection()); } catch (e) { logError(e, 'e4 noti'); }
    try { shell.add_child(buildEnd4CalendarSection()); } catch (e) { logError(e, 'e4 cal'); }

    const scroll = new St.ScrollView({
        style_class: 'material-panel-e4qs-scroll',
        x_expand: false,
        y_expand: true,
        overlay_scrollbars: true,
    });
    try { scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC); } catch (e) {}
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
            const maxH = mon ? Math.floor(mon.height * 0.88) : 720;
            menu.box.style = `max-height: ${maxH}px; width: ${QS_W}px; min-width: ${QS_W}px; max-width: ${QS_W}px; padding: 0; margin: 0; border-radius: 22px;`;
            menu.box.clip_to_allocation = true;
            try { menu.actor.width = QS_W; } catch (e) {}
            try { shell.width = QS_W; } catch (e) {}
            try { scroll.width = QS_W; } catch (e) {}
        } catch (e) {}
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else
            menuOpen(menu);
    });
    button.connect('destroy', () => { try { menu.destroy(); } catch (e) {} });

    try { log('material-panel: End-4 QS matched to reference layout'); } catch (e) {}
    return button;
}
