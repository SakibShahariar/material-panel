import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuToggle} from '../lib/shellCompat.js';
import {giconForKey, wireChipPress} from '../lib/pressFx.js';

function readGpuInfo() {
    try {
        const [, out] = GLib.spawn_command_line_sync(
            'nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits');
        const text = new TextDecoder('utf-8').decode(out).trim();
        if (text && !/error|not found|failed|NVIDIA-SMI has failed/i.test(text)) {
            const line = text.split('\n')[0];
            // name may contain commas — split from the right for last 4 numeric fields
            const parts = line.split(',').map(s => s.trim());
            if (parts.length >= 5) {
                const temp = parseInt(parts[parts.length - 1], 10);
                const memTotal = parseInt(parts[parts.length - 2], 10);
                const memUsed = parseInt(parts[parts.length - 3], 10);
                const util = parseInt(parts[parts.length - 4], 10);
                const name = parts.slice(0, parts.length - 4).join(', ');
                return {
                    vendor: 'NVIDIA',
                    name: name || 'NVIDIA',
                    util: Number.isFinite(util) ? util : null,
                    memUsed: Number.isFinite(memUsed) ? memUsed : null,
                    memTotal: Number.isFinite(memTotal) ? memTotal : null,
                    temp: Number.isFinite(temp) ? temp : null,
                };
            }
        }
    } catch (e) {}

    try {
        const base = '/sys/class/drm/card0/device';
        let util = null, temp = null, memUsed = null, memTotal = null, name = 'AMD';
        try {
            const [ok, c] = Gio.File.new_for_path(`${base}/gpu_busy_percent`).load_contents(null);
            if (ok) util = parseInt(new TextDecoder('utf-8').decode(c).trim(), 10);
        } catch (e) {}
        try {
            const [ok, c] = Gio.File.new_for_path(`${base}/mem_info_vram_used`).load_contents(null);
            if (ok) memUsed = Math.round(parseInt(new TextDecoder('utf-8').decode(c).trim(), 10) / (1024 * 1024));
        } catch (e) {}
        try {
            const [ok, c] = Gio.File.new_for_path(`${base}/mem_info_vram_total`).load_contents(null);
            if (ok) memTotal = Math.round(parseInt(new TextDecoder('utf-8').decode(c).trim(), 10) / (1024 * 1024));
        } catch (e) {}
        try {
            const [ok, c] = Gio.File.new_for_path(`${base}/vendor`).load_contents(null);
            if (ok) {
                const v = new TextDecoder('utf-8').decode(c).trim().toLowerCase();
                if (v.includes('0x1002') || v.includes('amd')) name = 'AMD';
                else if (v.includes('0x8086') || v.includes('intel')) name = 'Intel';
            }
        } catch (e) {}
        try {
            const hwmon = Gio.File.new_for_path(`${base}/hwmon`);
            if (hwmon.query_exists(null)) {
                const en = hwmon.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
                let info;
                while ((info = en.next_file(null)) !== null) {
                    try {
                        const [ok, c] = Gio.File.new_for_path(
                            `${base}/hwmon/${info.get_name()}/temp1_input`).load_contents(null);
                        if (ok) {
                            temp = Math.round(parseInt(new TextDecoder('utf-8').decode(c).trim(), 10) / 1000);
                            break;
                        }
                    } catch (e) {}
                }
                try { en.close(null); } catch (e) {}
            }
        } catch (e) {}
        if (util != null || temp != null || memUsed != null)
            return {vendor: name, name, util, memUsed, memTotal, temp};
    } catch (e) {}
    return null;
}

export function buildGpu(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        style_class: 'material-panel-gpu-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        gicon: giconForKey('gpu', false) || Gio.ThemedIcon.new('video-display-symbolic'),
    });
    const label = new St.Label({
        style_class: 'material-panel-gpu-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '—',
    });
    const box = new St.BoxLayout({
        style: 'spacing: 4px;',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-gpu-btn material-panel-chip',
        child: box,
        reactive: true,
        can_focus: true,
        track_hover: true,
    });
    try { wireChipPress(button); } catch (e) {}

    // Hide until we detect a GPU at least once
    button.visible = false;

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-gpu-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({vertical: true, style: 'spacing: 6px; padding: 4px; min-width: 220px;'});
    const title = new St.Label({text: 'GPU', style_class: 'material-panel-cpu-popup-title'});
    const nameL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    const utilL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    const memL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    const tempL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    body.add_child(title);
    body.add_child(nameL);
    body.add_child(utilL);
    body.add_child(memL);
    body.add_child(tempL);
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    const refresh = () => {
        const g = readGpuInfo();
        if (!g) {
            button.visible = false;
            label.text = '—';
            nameL.text = 'No GPU metrics available';
            utilL.text = '';
            memL.text = '';
            tempL.text = '';
            return GLib.SOURCE_CONTINUE;
        }
        button.visible = true;
        const util = g.util != null && Number.isFinite(g.util) ? g.util : null;
        label.text = util != null ? `${util}%` : (g.temp != null ? `${g.temp}°C` : g.vendor);
        try {
            if (util != null && util >= 90)
                button.add_style_class_name('material-panel-chip-warn');
            else
                button.remove_style_class_name('material-panel-chip-warn');
        } catch (e) {}
        nameL.text = g.name || g.vendor || 'GPU';
        utilL.text = util != null ? `Usage  ${util}%` : 'Usage  —';
        memL.text = (g.memUsed != null && g.memTotal != null)
            ? `VRAM  ${g.memUsed} / ${g.memTotal} MB`
            : 'VRAM  —';
        tempL.text = g.temp != null && Number.isFinite(g.temp) ? `Temp  ${g.temp}°C` : 'Temp  —';
        return GLib.SOURCE_CONTINUE;
    };

    refresh();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, refresh);
    button.connect('clicked', () => {
        refresh();
        menuToggle(menu);
        return Clutter.EVENT_STOP;
    });
    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });
    return button;
}
