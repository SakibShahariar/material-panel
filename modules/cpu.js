import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';

import {iconPath} from '../lib/iconTheme.js';

function findTempFile() {
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
                if (type === 'x86_pkg_temp') return {path: tempPath, name: type};
                candidates.push({type, path: tempPath, name});
            } catch (e) {}
        }
        enumerator.close(null);
    } catch (e) {}
    const pref = ['Tctl', 'Tdie', 'acpitz', 'x86_pkg_temp', 'cpu-thermal', 'cpu_thermal', 'pch_', 'soc_thermal'];
    for (const p of pref) {
        const c = candidates.find(x => x.type === p || x.type.startsWith(p));
        if (c) return {path: c.path, name: c.type};
    }
    for (const c of candidates) {
        try {
            const [ok, contents] = Gio.File.new_for_path(c.path).load_contents(null);
            if (!ok) continue;
            const v = parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
            const deg = v > 1000 ? v / 1000 : v;
            if (deg >= 20 && deg <= 110) return {path: c.path, name: c.type};
        } catch (e) {}
    }
    return candidates[0] ? {path: candidates[0].path, name: candidates[0].type} : null;
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

function readTempHwmon() {
    try {
        const dir = Gio.File.new_for_path('/sys/class/hwmon');
        const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            const hwmonPath = `/sys/class/hwmon/${name}`;
            try {
                const [ok, c] = Gio.File.new_for_path(`${hwmonPath}/name`).load_contents(null);
                const devName = ok ? new TextDecoder('utf-8').decode(c).trim() : '';
                if (devName.includes('coretemp') || devName.includes('k10temp') || devName.includes('cpu') || devName.includes('thermal')) {
                    const tempFiles = ['temp1_input', 'temp2_input', 'temp3_input'];
                    for (const tf of tempFiles) {
                        const tempPath = `${hwmonPath}/${tf}`;
                        const temp = readTemp(tempPath);
                        if (temp !== null) return temp;
                    }
                }
            } catch (e) {}
        }
        enumerator.close(null);
    } catch (e) {}
    return null;
}

function readTripPoints(zoneName) {
    const trips = {high: null, critical: null};
    try {
        const dir = Gio.File.new_for_path(`/sys/class/thermal/${zoneName}`);
        const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (name.startsWith('trip_point_') && name.endsWith('_temp')) {
                const [ok, contents] = Gio.File.new_for_path(`/sys/class/thermal/${zoneName}/${name}`).load_contents(null);
                if (ok) {
                    const raw = parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
                    const deg = raw > 1000 ? raw / 1000 : raw;
                    if (name.includes('trip_point_0') || name.includes('trip_point_1')) {
                        trips.high = Math.round(deg);
                    } else if (name.includes('trip_point_2') || name.includes('trip_point_3')) {
                        trips.critical = Math.round(deg);
                    }
                }
            }
        }
        enumerator.close(null);
    } catch (e) {}
    return trips;
}

function readLoadAvg() {
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/loadavg').load_contents(null);
        if (!ok) return null;
        const text = new TextDecoder('utf-8').decode(contents).trim();
        const parts = text.split(/\s+/);
        return {load1: parts[0], load5: parts[1], load15: parts[2]};
    } catch (e) { return null; }
}

function readPerCoreUsage() {
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/stat').load_contents(null);
        if (!ok) return null;
        const text = new TextDecoder('utf-8').decode(contents);
        const lines = text.split('\n').filter(l => l.startsWith('cpu') && l !== 'cpu ');
        const cores = [];
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 8) continue;
            const vals = parts.slice(1).map(Number);
            const idle = (vals[3] ?? 0) + (vals[4] ?? 0);
            const total = vals.reduce((a, b) => a + b, 0);
            cores.push({name: parts[0], idle, total});
        }
        return cores;
    } catch (e) { return null; }
}

function readCpuFreq() {
    const freqs = [];
    try {
        const dir = Gio.File.new_for_path('/sys/devices/system/cpu');
        const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (!name.startsWith('cpu') || name === 'cpu') continue;
            try {
                const [ok, contents] = Gio.File.new_for_path(`/sys/devices/system/cpu/${name}/cpufreq/scaling_cur_freq`).load_contents(null);
                if (ok) {
                    const khz = parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
                    freqs.push({core: name, mhz: Math.round(khz / 1000)});
                }
            } catch (e) {}
        }
        enumerator.close(null);
    } catch (e) {}
    return freqs.length > 0 ? freqs : null;
}

export function buildCpu(_extensionPath, scale = 1.0) {
    const button = new St.Button({
        style_class: 'material-panel-cpu material-panel-chip',
        reactive: true,
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
    });

    let cpuGicon;
    try {
        const p = iconPath('cpu');
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

    const cpuLabel = new St.Label({
        style_class: 'material-panel-cpu-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const tempLabel = new St.Label({
        style_class: 'material-panel-cpu-temp-label',
        y_align: Clutter.ActorAlign.CENTER,
    });

    const box = new St.BoxLayout({
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
    });
    box.add_child(cpuIcon);
    box.add_child(cpuLabel);
    box.add_child(tempIcon);
    box.add_child(tempLabel);
    button.set_child(box);

    const tempInfo = findTempFile();
    const tempPath = tempInfo?.path ?? null;
    const zoneName = tempInfo?.name ?? null;
    const tripPoints = zoneName ? readTripPoints(zoneName) : {high: null, critical: null};

    let prevCores = [];
    let primed = false;

    const readAll = () => {
        try {
            const [ok, contents] = Gio.File.new_for_path('/proc/stat').load_contents(null);
            if (!ok) return {totalPct: null, cores: null};
            const text = new TextDecoder('utf-8').decode(contents);

            const totalLine = text.split('\n').find(l => l.startsWith('cpu '));
            let totalPct = null;
            if (totalLine) {
                const vals = totalLine.trim().split(/\s+/).slice(1).map(Number);
                if (vals.length >= 4) {
                    const idle = (vals[3] ?? 0) + (vals[4] ?? 0);
                    const total = vals.reduce((a, b) => a + b, 0);
                    if (!primed) {
                        prevCores = [{idle, total}];
                        primed = true;
                    } else {
                        const diffIdle = idle - prevCores[0].idle;
                        const diffTotal = total - prevCores[0].total;
                        prevCores[0] = {idle, total};
                        if (diffTotal > 0) {
                            totalPct = Math.round((1 - diffIdle / diffTotal) * 100);
                        }
                    }
                }
            }

            const coreLines = text.split('\n').filter(l => l.startsWith('cpu') && l !== 'cpu ');
            const cores = [];
            for (const line of coreLines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 8) continue;
                const vals = parts.slice(1).map(Number);
                const idle = (vals[3] ?? 0) + (vals[4] ?? 0);
                const total = vals.reduce((a, b) => a + b, 0);
                const idx = cores.length;
                let pct = null;
                if (primed && prevCores[idx + 1]) {
                    const diffIdle = idle - prevCores[idx + 1].idle;
                    const diffTotal = total - prevCores[idx + 1].total;
                    if (diffTotal > 0) {
                        pct = Math.round((1 - diffIdle / diffTotal) * 100);
                    }
                }
                prevCores[idx + 1] = {idle, total};
                cores.push({name: parts[0], pct});
            }
            return {totalPct, cores};
        } catch (e) { return {totalPct: null, cores: null}; }
    };

    readAll();

    let updateLabels = () => {
        const {totalPct} = readAll();
        let temp = readTemp(tempPath);
        if (temp === null) temp = readTempHwmon();
        if (totalPct !== null) cpuLabel.text = `${totalPct}%`;
        else cpuLabel.text = '—';
        if (temp !== null) tempLabel.text = `${temp}°C`;
        else tempLabel.text = '';
        try { button.set_tooltip_text(`CPU ${totalPct !== null ? totalPct + '%' : '—'}  Temp ${temp !== null ? temp + '°C' : '—'}`); } catch (e) {}
        return GLib.SOURCE_CONTINUE;
    };

    updateLabels();
    const timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, updateLabels);

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    // Live-updating popup content (no full rebuild / no Refresh button)
    const usageValue = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-value'});
    const tempValue = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-value'});
    const loadValue = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-value'});
    const coreLabels = [];
    const thermalCurrent = new St.Label({text: 'Current: —', style_class: 'material-panel-cpu-popup-thermal-row'});
    const thermalHigh = new St.Label({text: '', style_class: 'material-panel-cpu-popup-thermal-row'});
    const thermalCrit = new St.Label({text: '', style_class: 'material-panel-cpu-popup-thermal-row'});

    {
        const header = new PopupMenu.PopupMenuSection();
        const headerBox = new St.BoxLayout({vertical: true, style_class: 'material-panel-cpu-popup-header'});
        headerBox.add_child(new St.Label({text: 'CPU', style_class: 'material-panel-cpu-popup-title'}));
        const summary = new St.BoxLayout({vertical: false, style_class: 'material-panel-cpu-popup-summary'});
        const usageBox = new St.BoxLayout({vertical: true});
        usageBox.add_child(new St.Label({text: 'Usage', style_class: 'material-panel-cpu-popup-label'}));
        usageBox.add_child(usageValue);
        summary.add_child(usageBox);
        const tempBox = new St.BoxLayout({vertical: true});
        tempBox.add_child(new St.Label({text: 'Temp', style_class: 'material-panel-cpu-popup-label'}));
        tempBox.add_child(tempValue);
        summary.add_child(tempBox);
        const loadBox = new St.BoxLayout({vertical: true});
        loadBox.add_child(new St.Label({text: 'Load', style_class: 'material-panel-cpu-popup-label'}));
        loadBox.add_child(loadValue);
        summary.add_child(loadBox);
        headerBox.add_child(summary);
        header.actor.add_child(headerBox);
        menu.addMenuItem(header);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    // Core rows built once; values updated live
    {
        const {cores} = readAll();
        const coresSection = new PopupMenu.PopupMenuSection();
        coresSection.actor.add_child(new St.Label({text: 'Per Core', style_class: 'material-panel-cpu-popup-section-title'}));
        const grid = new St.BoxLayout({vertical: true, style_class: 'material-panel-cpu-popup-cores'});
        const n = Math.max(cores?.length || 0, 1);
        for (let i = 0; i < n; i++) {
            const row = new St.BoxLayout({style_class: 'material-panel-cpu-popup-core-row', x_expand: true});
            row.add_child(new St.Label({text: `CPU${i}`, style_class: 'material-panel-cpu-popup-core-name'}));
            const val = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-core-value', x_expand: true});
            coreLabels.push(val);
            row.add_child(val);
            grid.add_child(row);
        }
        coresSection.actor.add_child(grid);
        menu.addMenuItem(coresSection);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    {
        const thermalSection = new PopupMenu.PopupMenuSection();
        thermalSection.actor.add_child(new St.Label({
            text: zoneName ? `Thermal (${zoneName})` : 'Thermal',
            style_class: 'material-panel-cpu-popup-section-title',
        }));
        const thermalGrid = new St.BoxLayout({vertical: true, style_class: 'material-panel-cpu-popup-thermal'});
        thermalGrid.add_child(thermalCurrent);
        thermalGrid.add_child(thermalHigh);
        thermalGrid.add_child(thermalCrit);
        thermalSection.actor.add_child(thermalGrid);
        menu.addMenuItem(thermalSection);
    }

    const refreshPopup = () => {
        const {totalPct, cores} = readAll();
        let temp = readTemp(tempPath);
        if (temp === null) temp = readTempHwmon();
        const load = readLoadAvg();
        const trips = zoneName ? readTripPoints(zoneName) : {high: null, critical: null};
        usageValue.text = totalPct !== null ? `${totalPct}%` : '—';
        tempValue.text = temp !== null ? `${temp}°C` : '—';
        if (load)
            loadValue.text = `${load.load1} ${load.load5} ${load.load15}`;
        else
            loadValue.text = '—';
        if (cores) {
            for (let i = 0; i < coreLabels.length; i++) {
                const c = cores[i];
                // cores may be numbers or objects
                const pct = typeof c === 'object' ? c?.pct : c;
                coreLabels[i].text = pct != null ? `${pct}%` : '—';
            }
        }
        thermalCurrent.text = `Current: ${temp !== null ? temp + '°C' : '—'}`;
        thermalHigh.text = trips.high != null ? `High: ${trips.high}°C` : '';
        thermalCrit.text = trips.critical != null ? `Critical: ${trips.critical}°C` : '';
    };

    // Drive popup from same 2s timer when open
    const prevUpdateLabels = updateLabels;
    updateLabels = () => {
        const r = prevUpdateLabels();
        if (menu.isOpen)
            refreshPopup();
        return r;
    };
    refreshPopup();
    menu.connect('open-state-changed', (_m, open) => {
        if (open)
            refreshPopup();
    });

    button.connect('clicked', () => menu.toggle());
    button.connect('destroy', () => {
        try { GLib.source_remove(timerId); } catch (e) {}
        menu.destroy();
    });

    return button;
}