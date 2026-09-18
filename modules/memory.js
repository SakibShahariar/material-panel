import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuToggle} from '../lib/shellCompat.js';
import {giconForKey, wireChipPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';

function readMemInfo() {
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/meminfo').load_contents(null);
        if (!ok) return null;
        const text = new TextDecoder('utf-8').decode(contents);
        const map = {};
        for (const line of text.split('\n')) {
            const m = line.match(/^(\w+):\s+(\d+)/);
            if (m) map[m[1]] = parseInt(m[2], 10);
        }
        const total = map.MemTotal ?? 0;
        const available = map.MemAvailable ?? map.MemFree ?? 0;
        const used = Math.max(0, total - available);
        const cached = (map.Cached ?? 0) + (map.SReclaimable ?? 0);
        const swapTotal = map.SwapTotal ?? 0;
        const swapFree = map.SwapFree ?? 0;
        const swapUsed = Math.max(0, swapTotal - swapFree);
        return {
            totalKb: total,
            availableKb: available,
            usedKb: used,
            cachedKb: cached,
            usedPct: total > 0 ? Math.round((used / total) * 100) : 0,
            swapTotalKb: swapTotal,
            swapUsedKb: swapUsed,
            swapPct: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0,
        };
    } catch (e) {
        return null;
    }
}

function fmtKb(kb) {
    if (kb == null || !Number.isFinite(kb)) return '—';
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(0)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
}

export function buildMemory(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        style_class: 'material-panel-memory-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        gicon: giconForKey('memory', false) || Gio.ThemedIcon.new('drive-harddisk-solidstate-symbolic'),
    });
    const label = new St.Label({
        style_class: 'material-panel-memory-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '—',
    });
    const box = new St.BoxLayout({
        style_class: 'material-panel-memory',
        style: 'spacing: 4px;',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-memory-btn material-panel-chip',
        child: box,
        reactive: true,
        can_focus: true,
        track_hover: true,
    });
    try { setChipA11y(button, 'Memory'); } catch (e) {}
    try { wireChipPress(button); } catch (e) {}

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-memory-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        vertical: true,
        style: 'spacing: 6px; padding: 4px; min-width: 200px;',
    });
    const title = new St.Label({text: 'Memory', style_class: 'material-panel-cpu-popup-title'});
    const usedL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    const availL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    const cacheL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    const swapL = new St.Label({style_class: 'material-panel-cpu-popup-value'});
    body.add_child(title);
    body.add_child(usedL);
    body.add_child(availL);
    body.add_child(cacheL);
    body.add_child(swapL);
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    const refresh = () => {
        const m = readMemInfo();
        if (!m) {
            label.text = '—';
            return GLib.SOURCE_CONTINUE;
        }
        label.text = `${m.usedPct}%`;
        try {
            if (m.usedPct >= 90)
                button.add_style_class_name('material-panel-chip-warn');
            else
                button.remove_style_class_name('material-panel-chip-warn');
        } catch (e) {}
        usedL.text = `Used  ${fmtKb(m.usedKb)} / ${fmtKb(m.totalKb)}  (${m.usedPct}%)`;
        availL.text = `Available  ${fmtKb(m.availableKb)}`;
        cacheL.text = `Cache  ${fmtKb(m.cachedKb)}`;
        swapL.text = m.swapTotalKb > 0
            ? `Swap  ${fmtKb(m.swapUsedKb)} / ${fmtKb(m.swapTotalKb)}  (${m.swapPct}%)`
            : 'Swap  none';
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
