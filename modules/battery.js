import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import UPowerGlib from 'gi://UPowerGlib';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPathPrimary} from '../lib/iconTheme.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';

function stateLabel(state) {
    // UPower DeviceState
    const map = {
        [UPowerGlib.DeviceState.CHARGING]: 'Charging',
        [UPowerGlib.DeviceState.DISCHARGING]: 'Discharging',
        [UPowerGlib.DeviceState.EMPTY]: 'Empty',
        [UPowerGlib.DeviceState.FULLY_CHARGED]: 'Full',
        [UPowerGlib.DeviceState.PENDING_CHARGE]: 'Pending charge',
        [UPowerGlib.DeviceState.PENDING_DISCHARGE]: 'Pending discharge',
    };
    try {
        return map[state] ?? 'Unknown';
    } catch (e) {
        return 'Unknown';
    }
}

function formatSeconds(sec) {
    if (!sec || sec <= 0 || sec > 60 * 60 * 48)
        return null;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0)
        return `${h}h ${m}m`;
    return `${m}m`;
}

export function buildBattery(_extensionPath, scale = 1.0) {
    let client, device;
    try {
        client = UPowerGlib.Client.new();
        device = client.get_display_device();
    } catch (e) {
        logError(e, 'material-panel: UPower unavailable');
        return null;
    }
    if (!device || device.is_present === false)
        return null;
    // Skip pure desktops (no battery percentage)
    try {
        if (device.kind === UPowerGlib.DeviceKind.LINE_POWER)
            return null;
    } catch (e) {}

    const button = new St.Button({
        style_class: 'material-panel-battery material-panel-chip',
        reactive: true,
    });
    const box = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER});
    const icon = new St.Icon({
        style_class: 'material-panel-battery-icon',
        icon_size: Math.round(17 * scale),
        y_align: Clutter.ActorAlign.CENTER,
    });
    const label = new St.Label({
        style_class: 'material-panel-battery-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(icon);
    box.add_child(label);
    button.set_child(box);

    const setIconKey = key => {
        try {
            icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary(key)));
        } catch (e) {}
    };

    const pctLabel = new St.Label({text: '—', style_class: 'material-panel-battery-popup-value'});
    const stateL = new St.Label({text: '—', style_class: 'material-panel-battery-popup-row'});
    const timeL = new St.Label({text: '', style_class: 'material-panel-battery-popup-row'});
    const energyL = new St.Label({text: '', style_class: 'material-panel-battery-popup-row'});

    const refresh = () => {
        let pct = 0;
        try {
            pct = Math.round(device.percentage);
        } catch (e) {}
        let charging = false;
        try {
            charging = device.state === UPowerGlib.DeviceState.CHARGING ||
                device.state === UPowerGlib.DeviceState.PENDING_CHARGE;
        } catch (e) {}
        let key = 'battery-full';
        if (charging)
            key = 'battery-charging';
        else if (pct <= 15)
            key = 'battery-critical';
        else if (pct <= 30)
            key = 'battery-low';
        else if (pct <= 70)
            key = 'battery-high';
        else
            key = 'battery-full';
        setIconKey(key);
        label.text = `${pct}%`;

        pctLabel.text = `${pct}%`;
        stateL.text = stateLabel(device.state);
        let timeText = '';
        try {
            if (device.state === UPowerGlib.DeviceState.CHARGING) {
                const t = formatSeconds(device.time_to_full);
                if (t) timeText = `Full in ${t}`;
            } else if (device.state === UPowerGlib.DeviceState.DISCHARGING) {
                const t = formatSeconds(device.time_to_empty);
                if (t) timeText = `${t} remaining`;
            }
        } catch (e) {}
        timeL.text = timeText;
        try {
            if (device.energy_full > 0)
                energyL.text = `${device.energy.toFixed?.(1) ?? device.energy} / ${device.energy_full.toFixed?.(1) ?? device.energy_full} Wh`;
            else
                energyL.text = '';
        } catch (e) {
            energyL.text = '';
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
    wrap.add_child(new St.Label({text: 'Battery', style_class: 'material-panel-battery-popup-title'}));
    wrap.add_child(pctLabel);
    wrap.add_child(stateL);
    wrap.add_child(timeL);
    wrap.add_child(energyL);
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
