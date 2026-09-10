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
import {wireFileIconPress, tintSymbolic, primaryColor, onPrimaryColor} from '../lib/pressFx.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';
import {createSlider} from '../lib/simpleSlider.js';
import {getMixerControl} from '../lib/audio.js';
import {iconPath, iconPathOnAccent, iconPathPrimary} from '../lib/iconTheme.js';
import {createMaterialSymbol} from '../lib/materialSymbol.js';
import {buildEnd4NotiSection, buildEnd4CalendarSection} from '../lib/end4QsExtras.js';
import {wifiQsBlock, bluetoothTile} from './quicksettings.js';
import {confirmAndRun} from '../lib/powerConfirm.js';
import {buildMediaPlayerRow} from './mediaPlayer.js';

const UUID = 'material-panel@SakibShahariar';
const QS_W = 360;
const QS_PAD = 12;
const QS_INNER = QS_W - QS_PAD * 2;
function accent() {
    return globalThis._materialPanelPrimary ?? '#89b4fa';
}
function onAccent() {
    return globalThis._materialPanelOnPrimary ?? '#1e1e2e';
}
/** Matugen-driven surfaces (set in theme.apply). Never hardcode white alpha. */
function surface() {
    return globalThis._materialPanelQsSurface ?? 'rgba(49, 50, 68, 0.55)';
}
function surfaceHover() {
    return globalThis._materialPanelHoverBg ?? 'rgba(205, 214, 244, 0.14)';
}
function surfaceHoverStrong() {
    return globalThis._materialPanelHoverBgStrong ?? 'rgba(205, 214, 244, 0.22)';
}
// Back-compat aliases used in this file
const SURFACE = null; // do not use — call surface()

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

/** @deprecated use confirmAndRun */
function confirmPower(action) {
    const map = {
        logout: ['Log out', 'Close all apps and log out?', 'Log out', 'gnome-session-quit --logout --no-prompt'],
        reboot: ['Restart', 'Restart this system now?', 'Restart', 'systemctl reboot'],
        poweroff: ['Power off', 'Power off this system?', 'Power off', 'systemctl poweroff'],
    };
    const entry = map[action];
    if (!entry)
        return;
    confirmAndRun(entry[0], entry[1], entry[2], entry[3]);
}

// ── Header (end-4: uptime | edit refresh settings power | battery badge) ──

function buildHeader(menu) {
    const row = new St.BoxLayout({vertical: false, x_expand: true});
    style(row, 'spacing: 6px;');

    const uptimePill = new St.BoxLayout({
        vertical: false,
        y_align: Clutter.ActorAlign.CENTER,
    });
    style(uptimePill, `background-color: ${surface()}; border-radius: 999px; padding: 4px 12px 4px 8px; spacing: 6px;`);

    // Fedora logo (falls back to symbolic / os-release brand)
    const logo = new St.Icon({
        icon_size: 16,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        const g = loadGicon(['fedora-logo'], false);
        if (g)
            logo.gicon = g;
        else
            logo.icon_name = 'fedora-logo-icon';
    } catch (e) {
        try { logo.icon_name = 'fedora-logo-icon'; } catch (e2) {}
    }
    uptimePill.add_child(logo);

    const uptime = new St.Label({text: 'Up —', y_align: Clutter.ActorAlign.CENTER});
    style(uptime, 'font-size: 12px; font-weight: 600;');
    uptimePill.add_child(uptime);
    row.add_child(uptimePill);

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
        const b = new St.Button({
            style_class: 'material-panel-e4qs-header-btn',
            reactive: true,
            track_hover: true,
            can_focus: true,
        });
        // Prefer *-symbolic so St tints with CSS color (on_primary on press)
        let name = symbolic;
        if (name && !String(name).endsWith('-symbolic'))
            name = `${name}-symbolic`;
        const ic = new St.Icon({
            icon_name: name,
            icon_size: 14,
            style_class: 'material-panel-e4qs-header-icon',
        });
        try { ic.style = `-st-icon-style: symbolic; color: ${accent()};`; } catch (e) {}
        const apply = state => {
            try {
                b.remove_style_class_name('pressed');
                b.remove_style_class_name('hover');
            } catch (e) {}
            let bg = surface();
            let fg = accent();
            if (state === 'active' || state === 'pressed') {
                bg = accent();
                fg = onAccent();
                try { b.add_style_class_name('pressed'); } catch (e) {}
            } else if (state === 'hover' || state === 'focus') {
                bg = surfaceHover();
                try { b.add_style_class_name('hover'); } catch (e) {}
            }
            // Inline mirrors CSS so FileIcon/symbolic always gets on_primary, not default white
            style(b, `width: 30px; height: 30px; border-radius: 999px; background-color: ${bg};`);
            try {
                ic.style = `-st-icon-style: symbolic; color: ${fg};`;
            } catch (e) {}
        };
        apply('normal');
        b.set_child(ic);
        b.connect('notify::hover', () => apply(b.hover ? 'hover' : 'normal'));
        b.connect('button-press-event', () => { apply('pressed'); return Clutter.EVENT_PROPAGATE; });
        b.connect('button-release-event', () => { apply(b.hover ? 'hover' : 'normal'); return Clutter.EVENT_PROPAGATE; });
        b.connect('leave-event', () => { apply('normal'); return Clutter.EVENT_PROPAGATE; });
        b.connect('clicked', () => { try { fn(); } catch (e) {} });
        return b;
    };
    row.add_child(mkBtn('document-edit-symbolic', openPrefs));
    row.add_child(mkBtn('view-refresh-symbolic', () => {
        try { Main.notify('material-panel', 'Quick Settings refreshed'); } catch (e) {}
    }));
    row.add_child(mkBtn('emblem-system-symbolic', openPrefs));
    row.add_child(mkBtn('system-shutdown-symbolic', () => {
        try { menuClose(menu); } catch (e) {}
        confirmAndRun('Power off', 'Power off this system?', 'Power off', 'systemctl poweroff');
    }));

    const batt = new St.Label({text: '—%', y_align: Clutter.ActorAlign.CENTER});
    style(batt, `background-color: ${surface()}; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700;`);
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
    // end-4-inspired: two full-width slider rows (not side-by-side)
    const trackW = QS_INNER - 28 - 16; // padding + icon

    const col = new St.BoxLayout({vertical: true, x_expand: false});
    style(col, `spacing: 8px; width: ${QS_INNER}px;`);
    try { col.width = QS_INNER; } catch (e) {}

    const mkRow = (iconKeys, symbolic, slider) => {
        const row = new St.BoxLayout({vertical: false, x_expand: false});
        style(row, `background-color: ${surface()}; border-radius: 999px; padding: 10px 14px; spacing: 12px; width: ${QS_INNER}px;`);
        try { row.width = QS_INNER; } catch (e) {}
        const ic = makeIcon(iconKeys, 18, false, symbolic);
        try { if (symbolic) ic.icon_name = symbolic; } catch (e) {}
        row.add_child(ic);
        row.add_child(slider.actor);
        return row;
    };

    let sink = null;
    let control = null;
    const volIconKeys = ['volume-high', 'volume-medium', 'volume-low', 'volume-muted'];
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
        },
    });
    const volRow = mkRow(['volume-high'], 'audio-volume-high-symbolic', volSlider);
    // keep icon ref for updates
    const volIcon = volRow.get_child_at_index(0);
    try {
        const orig = volSlider.actor;
        // wrap onChange to update icon - already set; re-bind via control
    } catch (e) {}

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
                const pct = Math.round(v * 100);
                const key = pct === 0 ? 'volume-muted' : pct < 33 ? 'volume-low' : pct < 66 ? 'volume-medium' : 'volume-high';
                const g = loadGicon(key);
                if (g && volIcon)
                    volIcon.gicon = g;
            } catch (e) {}
        };
        if (control) {
            try { control.connect('state-changed', bind); } catch (e) {}
            try { control.connect('default-sink-changed', bind); } catch (e) {}
            bind();
        }
    } catch (e) {}

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
    const briRow = mkRow(['brightness'], 'weather-clear-symbolic', briSlider);

    col.add_child(volRow);
    col.add_child(briRow);
    return col;
}

// ── Toggles (end-4 style: round + labeled wide) ──

function makeRoundToggle({iconKeys, symbolic, getOn, setOn}) {
    const btn = new St.Button({reactive: true, can_focus: true, track_hover: true, x_expand: false});
    const ic = makeIcon(iconKeys, 20, false, symbolic);
    btn.set_child(ic);
    let pressed = false;

    const paint = () => {
        let on = false;
        try { on = !!getOn(); } catch (e) {}
        let bg = on ? accent() : surface();
        if (pressed)
            bg = on ? accent() : surfaceHoverStrong();
        else if (btn.hover && !on)
            bg = surfaceHover();
        else if (btn.hover && on)
            bg = accent();
        style(btn, `border-radius: 999px; width: 52px; height: 52px; background-color: ${bg};`);
        try { btn.width = 52; btn.height = 52; } catch (e) {}
        const g = loadGicon(iconKeys, on);
        if (g) {
            ic.gicon = g;
        } else if (symbolic) {
            ic.icon_name = symbolic;
            // on = primary bg → icon must be on_primary (not default white)
            tintSymbolic(ic, on || pressed ? onPrimaryColor() : primaryColor());
        }
        try { btn.remove_style_class_name('pressed'); } catch (e) {}
        if (pressed) {
            try { btn.add_style_class_name('pressed'); } catch (e) {}
        }
    };
    btn.connect('notify::hover', paint);
    btn.connect('button-press-event', () => { pressed = true; paint(); return Clutter.EVENT_PROPAGATE; });
    btn.connect('button-release-event', () => { pressed = false; paint(); return Clutter.EVENT_PROPAGATE; });
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
    const btn = new St.Button({reactive: true, can_focus: true, track_hover: true, x_expand: false});
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
    let pressed = false;

    const paint = () => {
        let on = false;
        try { on = !!getOn(); } catch (e) {}
        const w = width || 140;
        let bg = on ? accent() : surface();
        if (pressed)
            bg = on ? accent() : surfaceHoverStrong();
        else if (btn.hover && !on)
            bg = surfaceHover();
        else if (btn.hover && on)
            bg = accent();
        style(btn, `border-radius: 18px; height: 52px; width: ${w}px; padding: 6px 10px; background-color: ${bg};`);
        try { btn.width = w; btn.height = 52; } catch (e) {}
        const g = loadGicon(iconKeys, on);
        if (g) {
            ic.gicon = g;
        } else if (symbolic) {
            ic.icon_name = symbolic;
            tintSymbolic(ic, on || pressed ? onPrimaryColor() : primaryColor());
        }
        style(title, on
            ? `font-size: 12px; font-weight: 700; color: ${onAccent()};`
            : 'font-size: 12px; font-weight: 700; color: #eee6f4;');
        if (subLab)
            style(subLab, on
                ? 'font-size: 11px; color: #3a2a32;'
                : 'font-size: 11px; opacity: 0.7; color: #c8bdd0;');
    };
    btn.connect('notify::hover', paint);
    btn.connect('button-press-event', () => { pressed = true; paint(); return Clutter.EVENT_PROPAGATE; });
    btn.connect('button-release-event', () => { pressed = false; paint(); return Clutter.EVENT_PROPAGATE; });
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

    // Full Wi‑Fi + Bluetooth (NM / BlueZ) — not stub nmcli toggles
    // Each has power toggle, status, chevron, and expandable device/network list.
    const wifi = wifiQsBlock();
    const bt = bluetoothTile();
    try {
        wifi.x_expand = true;
        wifi.width = QS_INNER;
        if (wifi.style_class && !wifi.style_class.includes('material-panel-qs-wifi-row'))
            wifi.add_style_class_name('material-panel-qs-wifi-row');
    } catch (e) {}
    try {
        bt.x_expand = true;
        bt.width = QS_INNER;
        bt.style = `width: ${QS_INNER}px; min-width: ${QS_INNER}px;`;
    } catch (e) {}
    try {
        wifi.style = `width: ${QS_INNER}px; min-width: ${QS_INNER}px; border-radius: 18px;`;
    } catch (e) {}

    const netCol = new St.BoxLayout({vertical: true, x_expand: true});
    style(netCol, `spacing: 8px; width: ${QS_INNER}px;`);
    netCol.add_child(wifi);
    netCol.add_child(bt);
    // Expand panels sit under the tiles (same as default QS)
    try {
        if (bt.devicePanel) {
            bt.devicePanel.visible = false;
            try { bt.devicePanel.x_expand = true; bt.devicePanel.width = QS_INNER; } catch (e) {}
            netCol.add_child(bt.devicePanel);
        }
    } catch (e) { logError(e, 'e4 qs bt panel'); }
    try {
        if (wifi.listPanel) {
            wifi.listPanel.visible = false;
            try { wifi.listPanel.x_expand = true; wifi.listPanel.width = QS_INNER; } catch (e) {}
            netCol.add_child(wifi.listPanel);
        }
    } catch (e) { logError(e, 'e4 qs wifi panel'); }

    // Row of round toggles: dark / dnd / night (former third slot + rest)
    const row0 = new St.BoxLayout({vertical: false});
    style(row0, 'spacing: 8px;');
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
    row0.add_child(darkRound);
    root.add_child(netCol);
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
        {icon: 'system-log-out-symbolic', title: 'Log out', body: 'Close all apps and log out?', confirm: 'Log out', cmd: 'gnome-session-quit --logout --no-prompt'},
        {icon: 'view-refresh-symbolic', title: 'Restart', body: 'Restart this system now?', confirm: 'Restart', cmd: 'systemctl reboot'},
        {icon: 'system-shutdown-symbolic', title: 'Power off', body: 'Power off this system?', confirm: 'Power off', cmd: 'systemctl poweroff'},
    ];
    for (const a of actions) {
        const b = new St.Button({reactive: true, x_expand: false});
        let pressed = false;
        const ic = new St.Icon({
            icon_name: a.icon,
            icon_size: 16,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const paintP = () => {
            let bg = surface();
            let fg = accent();
            if (pressed) {
                bg = accent();
                fg = onAccent();
            } else if (b.hover) {
                bg = surfaceHover();
            }
            style(b, `border-radius: 999px; height: 42px; width: ${btnW}px; background-color: ${bg};`);
            try { tintSymbolic(ic, fg); } catch (e) {}
        };
        paintP();
        try { b.width = btnW; b.height = 42; } catch (e) {}
        b.set_child(ic);
        try { b.track_hover = true; } catch (e) {}
        b.connect('notify::hover', paintP);
        b.connect('button-press-event', () => { pressed = true; paintP(); return Clutter.EVENT_PROPAGATE; });
        b.connect('button-release-event', () => { pressed = false; paintP(); return Clutter.EVENT_PROPAGATE; });
        b.connect('clicked', () => {
            try { menuClose(menu); } catch (e) {}
            confirmAndRun(a.title, a.body, a.confirm, a.cmd);
        });
        row.add_child(b);
    }
    return row;
}

export function buildQuickSettingsEnd4(_extensionPath, scale = 1.0) {
    const qsSize = Math.round(17 * scale);
    let qsSymbol = createMaterialSymbol('quicksettings', qsSize, globalThis._materialPanelPrimary ?? '#89b4fa', 1);
    let qsIcon = null;
    if (!qsSymbol) {
        qsIcon = new St.Icon({
            icon_size: qsSize,
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('quicksettings'))),
        });
    }
    const button = new St.Button({
        style_class: 'material-panel-quicksettings-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        child: qsSymbol || qsIcon,
    });
    try {
        wireFileIconPress(button, () => qsSymbol
            ? [{symbol: qsSymbol, key: 'quicksettings'}]
            : [{icon: qsIcon, key: 'quicksettings'}]);
    } catch (e) {}

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
    try {
        const media = buildMediaPlayerRow();
        if (media) {
            try { media.x_expand = true; media.width = QS_INNER; } catch (e) {}
            shell.add_child(media);
        }
    } catch (e) { logError(e, 'e4 qs media'); }
    shell.add_child(buildToggleGrid());
    shell.add_child(buildPowerStrip(menu));
    try { shell.add_child(buildEnd4NotiSection()); } catch (e) { logError(e, 'e4 noti'); }
    try { shell.add_child(buildEnd4CalendarSection()); } catch (e) { logError(e, 'e4 cal'); }

    const scroll = new St.ScrollView({
        style_class: 'material-panel-e4qs-scroll material-panel-qs-scroll',
        x_expand: false,
        y_expand: true,
        overlay_scrollbars: true,
    });
    try {
        // Scroll when content overflows; overlay + CSS hide the bar
        scroll.overlay_scrollbars = true;
        if (St.PolicyType) {
            scroll.vscrollbar_policy = St.PolicyType.AUTOMATIC;
            scroll.hscrollbar_policy = St.PolicyType.NEVER;
        }
        if (scroll.set_policy)
            scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    } catch (e) {}
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
