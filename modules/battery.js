import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import UPowerGlib from 'gi://UPowerGlib';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPath, iconPathPrimary, iconPathOnAccent} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';

function formatSeconds(sec) {
    if (!sec || sec <= 0 || sec > 60 * 60 * 48)
        return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0)
        return `${h}h ${m}m`;
    return `${m}m`;
}

function stateLabel(state) {
    const map = {
        [UPowerGlib.DeviceState.CHARGING]: 'Charging',
        [UPowerGlib.DeviceState.DISCHARGING]: 'Discharging',
        [UPowerGlib.DeviceState.EMPTY]: 'Empty',
        [UPowerGlib.DeviceState.FULLY_CHARGED]: 'Full',
        [UPowerGlib.DeviceState.PENDING_CHARGE]: 'Pending charge',
        [UPowerGlib.DeviceState.PENDING_DISCHARGE]: 'Pending discharge',
    };
    return map[state] || 'Unknown';
}

function makeStat(title) {
    const col = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-popup-stat',
        x_expand: true,
    });
    const t = new St.Label({text: title, style_class: 'material-panel-popup-stat-label'});
    const v = new St.Label({text: '—', style_class: 'material-panel-popup-stat-value'});
    col.add_child(t);
    col.add_child(v);
    return {col, value: v};
}

export function buildBattery(extensionPath, scale = 1.0) {
    const client = UPowerGlib.Client.new();
    let device = null;
    // Prefer real battery (BAT*) so % matches `upower -i BAT0`, not a composite DisplayDevice
    try {
        const devices = client.get_devices?.() || [];
        for (let i = 0; i < devices.length; i++) {
            const d = devices[i];
            try {
                if (d.is_present === false)
                    continue;
                if (d.kind === UPowerGlib.DeviceKind.BATTERY ||
                    (d.native_path && String(d.native_path).includes('BAT'))) {
                    device = d;
                    break;
                }
            } catch (e) {}
        }
    } catch (e) {}
    if (!device) {
        try {
            device = client.get_display_device();
        } catch (e) {}
    }
    if (!device)
        return null;

    const box = new St.BoxLayout({
        style_class: 'material-panel-battery',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
    });

    let currentKey = 'battery-full';
    const setIconKey = key => {
        currentKey = key;
        try {
            let pth = iconPathPrimary(key);
            if (!Gio.File.new_for_path(pth).query_exists(null))
                pth = iconPath(key);
            if (Gio.File.new_for_path(pth).query_exists(null))
                icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(pth));
        } catch (e) {}
    };

    const icon = new St.Icon({
        style_class: 'material-panel-battery-icon',
        icon_size: Math.round(17 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
    });
    const label = new St.Label({
        style_class: 'material-panel-battery-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '—',
    });
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-battery-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        child: box,
    });
    try {
        label.clutter_text.ellipsize = 0; // none
    } catch (e) {}
    const press = wireFileIconPress(button, () => [{icon, key: currentKey}]);

    // Popup widgets
    const pctHero = new St.Label({text: '—', style_class: 'material-panel-battery-popup-value'});
    const stateHero = new St.Label({text: '—', style_class: 'material-panel-battery-popup-state'});
    const barTrack = new St.Widget({
        style_class: 'material-panel-battery-popup-bar',
        x_expand: true,
        height: 8,
    });
    const barFill = new St.Widget({
        style_class: 'material-panel-battery-popup-bar-fill',
        height: 8,
        width: 4,
        x_align: Clutter.ActorAlign.START,
        y_expand: true,
    });
    barTrack.add_child(barFill);

    const sTime = makeStat('Time');
    const sEnergy = makeStat('Energy');
    const sRate = makeStat('Power');
    const sHealth = makeStat('Health');
    const modelLabel = new St.Label({text: '', style_class: 'material-panel-battery-popup-model'});

    const refresh = () => {
        let pct = 0;
        try {
            pct = Math.round(device.percentage);
        } catch (e) {}
        if (!Number.isFinite(pct))
            pct = 0;

        let key = 'battery-full';
        try {
            if (device.state === UPowerGlib.DeviceState.CHARGING)
                key = 'battery-charging';
            else if (pct <= 15)
                key = 'battery-critical';
            else if (pct <= 30)
                key = 'battery-low';
            else if (pct <= 70)
                key = 'battery-high';
            else
                key = 'battery-full';
        } catch (e) {}
        setIconKey(key);
        label.text = `${pct}%`;
        try { press.applyIcons(); } catch (e) {}

        pctHero.text = `${pct}%`;
        stateHero.text = stateLabel(device.state);
        try {
            const model = device.model || device.vendor || '';
            const path = device.native_path || '';
            modelLabel.text = [model, path].filter(Boolean).join(' · ');
        } catch (e) {
            modelLabel.text = '';
        }
        const barW = Math.max(4, Math.round(2.4 * pct));
        try { barFill.width = barW; } catch (e) {}

        try {
            if (device.state === UPowerGlib.DeviceState.CHARGING) {
                const t = formatSeconds(device.time_to_full);
                sTime.value.text = t ? `Full in ${t}` : '—';
            } else if (device.state === UPowerGlib.DeviceState.DISCHARGING) {
                const t = formatSeconds(device.time_to_empty);
                sTime.value.text = t ? `${t} left` : '—';
            } else {
                sTime.value.text = '—';
            }
        } catch (e) {
            sTime.value.text = '—';
        }

        try {
            if (device.energy_full > 0)
                sEnergy.value.text = `${(device.energy ?? 0).toFixed?.(1) ?? device.energy} / ${(device.energy_full).toFixed?.(1)} Wh`;
            else
                sEnergy.value.text = '—';
        } catch (e) {
            sEnergy.value.text = '—';
        }

        try {
            const rate = Math.abs(device.energy_rate || 0);
            sRate.value.text = rate > 0.05 ? `${rate.toFixed(1)} W` : '—';
        } catch (e) {
            sRate.value.text = '—';
        }

        try {
            if (device.energy_full_design > 0 && device.energy_full > 0) {
                const h = Math.round(100 * device.energy_full / device.energy_full_design);
                sHealth.value.text = `${Math.min(100, h)}%`;
            } else {
                sHealth.value.text = '—';
            }
        } catch (e) {
            sHealth.value.text = '—';
        }
    };

    refresh();
    let notifyId = 0;
    try {
        notifyId = device.connect('notify', refresh);
    } catch (e) {}
    const timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
        refresh();
        return GLib.SOURCE_CONTINUE;
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-battery-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const section = new PopupMenu.PopupMenuSection();
    const wrap = new St.BoxLayout({vertical: true, style_class: 'material-panel-battery-popup-body'});

    const hero = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-popup-card material-panel-battery-popup-hero',
    });
    hero.add_child(pctHero);
    hero.add_child(stateHero);
    hero.add_child(modelLabel);
    hero.add_child(barTrack);
    wrap.add_child(hero);

    const grid = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-popup-card material-panel-popup-stats',
        x_expand: true,
    });
    const colA = new St.BoxLayout({vertical: true, style_class: 'material-panel-popup-stats-col', x_expand: true});
    const colB = new St.BoxLayout({vertical: true, style_class: 'material-panel-popup-stats-col', x_expand: true});
    colA.add_child(sTime.col);
    colA.add_child(sEnergy.col);
    colB.add_child(sRate.col);
    colB.add_child(sHealth.col);
    grid.add_child(colA);
    grid.add_child(colB);
    wrap.add_child(grid);

    section.actor.add_child(wrap);
    menu.addMenuItem(section);

    menu.connect('open-state-changed', (_m, open) => {
        if (open)
            refresh();
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menu.close();
        else
            menu.open();
    });
    button.connect('destroy', () => {
        if (notifyId) try { device.disconnect(notifyId); } catch (e) {}
        try { GLib.source_remove(timerId); } catch (e) {}
        menu.destroy();
    });

    return button;
}
