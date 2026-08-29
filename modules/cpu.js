import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';

// CPU usage + temperature chip for left panel
// Polls /proc/stat for usage and /sys/class/thermal for temperature.
// Returns a St.BoxLayout chip (like battery/volume) sized via scale.

function findTempFile() {
    // Prefer x86_pkg_temp, then any thermal_zone with sensible temp
    const candidates = [];
    try {
        const dir = Gio.File.new_for_path('/sys/class/thermal');
        const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (!name.startsWith('thermal_zone')) continue;
            const typePath = `/sys/class/thermal/${name}/type`;
            const tempPath = `/sys/class/thermal/${name}/temp`;
            try {
                const [ok, c] = Gio.File.new_for_path(typePath).load_contents(null);
                const type = ok ? new TextDecoder('utf-8').decode(c).trim() : '';
                // Prefer x86_pkg_temp
                if (type === 'x86_pkg_temp') return tempPath;
                candidates.push({type, path: tempPath});
            } catch (e) {}
        }
        enumerator.close(null);
    } catch (e) {}
    // Fallback order: Tctl, Tdie, acpitz, then first with 20-110°C
    const pref = ['Tctl', 'Tdie', 'acpitz', 'x86_pkg_temp'];
    for (const p of pref) {
        const c = candidates.find(x => x.type === p);
        if (c) return c.path;
    }
    for (const c of candidates) {
        try {
            const [ok, contents] = Gio.File.new_for_path(c.path).load_contents(null);
            if (!ok) continue;
            const v = parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
            const deg = v > 1000 ? v / 1000 : v;
            if (deg >= 20 && deg <= 110) return c.path;
        } catch (e) {}
    }
    return candidates[0]?.path ?? null;
}

function readTemp(tempPath) {
    if (!tempPath) return null;
    try {
        const [ok, contents] = Gio.File.new_for_path(tempPath).load_contents(null);
        if (!ok) return null;
        const raw = parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
        if (!Number.isFinite(raw)) return null;
        const c = raw > 1000 ? raw / 1000 : raw;
        if (c < -30 || c > 150) return null;
        return Math.round(c);
    } catch (e) { return null; }
}

export function buildCpu(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-cpu material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
    });

    // CPU usage icon
    let cpuGicon;
    try {
        const p = iconPathPrimary('cpu');
        if (Gio.File.new_for_path(p).query_exists(null))
            cpuGicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
        else
            cpuGicon = Gio.ThemedIcon.new('computer-symbolic');
    } catch (e) {
        cpuGicon = Gio.ThemedIcon.new('computer-symbolic');
    }
    const cpuIcon = new St.Icon({
        style_class: 'material-panel-cpu-icon',
        icon_size: Math.round(17 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: cpuGicon,
    });

    // Temperature icon
    let tempGicon;
    try {
        const p = iconPath('cpu-temp');
        if (Gio.File.new_for_path(p).query_exists(null))
            tempGicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
        else
            tempGicon = Gio.ThemedIcon.new('computer-symbolic');
    } catch (e) {
        tempGicon = Gio.ThemedIcon.new('computer-symbolic');
    }
    const tempIcon = new St.Icon({
        style_class: 'material-panel-cpu-temp-icon',
        icon_size: Math.round(15 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: tempGicon,
    });

    const label = new St.Label({
        style_class: 'material-panel-cpu-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(cpuIcon);
    box.add_child(tempIcon);
    box.add_child(label);

    // Cpu usage state via /proc/stat diff
    let prevIdle = 0;
    let prevTotal = 0;
    let primed = false;
    const tempPath = findTempFile();

    const readCpuPct = () => {
        try {
            const [ok, contents] = Gio.File.new_for_path('/proc/stat').load_contents(null);
            if (!ok) return null;
            const text = new TextDecoder('utf-8').decode(contents);
            const line = text.split('\n').find(l => l.startsWith('cpu '));
            if (!line) return null;
            const vals = line.trim().split(/\s+/).slice(1).map(Number);
            if (vals.length < 4) return null;
            const idle = (vals[3] ?? 0) + (vals[4] ?? 0);
            const total = vals.reduce((a, b) => a + b, 0);
            if (!primed) {
                prevIdle = idle;
                prevTotal = total;
                primed = true;
                return null;
            }
            const diffIdle = idle - prevIdle;
            const diffTotal = total - prevTotal;
            prevIdle = idle;
            prevTotal = total;
            if (diffTotal <= 0) return null;
            return Math.round((1 - diffIdle / diffTotal) * 100);
        } catch (e) { return null; }
    };

    // Prime first reading
    readCpuPct();

    const update = () => {
        const pct = readCpuPct();
        const temp = readTemp(tempPath);
        let text;
        if (pct !== null && temp !== null) text = `${pct}%  ${temp}°C`;
        else if (pct !== null) text = `${pct}%`;
        else if (temp !== null) text = `${temp}°C`;
        else text = '—';
        label.text = text;
        // Tooltip with detail
        try { box.set_tooltip_text(`CPU ${pct !== null ? pct + '%' : '—'}  Temp ${temp !== null ? temp + '°C' : '—'}`); } catch (e) {}
        return GLib.SOURCE_CONTINUE;
    };
    update();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, update);
    box.connect('destroy', () => { try { GLib.source_remove(id); } catch (e) {} });

    return box;
}
