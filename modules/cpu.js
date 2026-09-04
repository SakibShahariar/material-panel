import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';

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
        track_hover: true,
        reactive: true,
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
    });

    let cpuGicon;
    try {
        let p = iconPathPrimary('cpu');
        if (!Gio.File.new_for_path(p).query_exists(null))
            p = iconPath('cpu');
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
        let p = iconPathPrimary('cpu-temp');
        if (!Gio.File.new_for_path(p).query_exists(null))
            p = iconPath('cpu-temp');
        if (Gio.File.new_for_path(p).query_exists(null))
            tempGicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
        else
            tempGicon = Gio.ThemedIcon.new('temperature-symbolic');
    } catch (e) {
        tempGicon = Gio.ThemedIcon.new('temperature-symbolic');
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
    wireFileIconPress(button, () => [
        {icon: cpuIcon, key: 'cpu'},
        {icon: tempIcon, key: 'cpu-temp'},
    ]);

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

    let refreshPopup = (_data) => {}; // assigned after popup widgets exist

    let updateLabels = () => {
        // Single sample per tick — calling readAll twice ate the delta (popup stuck ~0%)
        const data = readAll();
        const totalPct = data.totalPct;
        let temp = readTemp(tempPath);
        if (temp === null) temp = readTempHwmon();
        if (totalPct !== null) cpuLabel.text = `${totalPct}%`;
        else cpuLabel.text = '—';
        if (temp !== null) tempLabel.text = `${temp}°C`;
        else tempLabel.text = '';
        try {
            button.set_tooltip_text(
                `CPU ${totalPct !== null ? totalPct + '%' : '—'}  Temp ${temp !== null ? temp + '°C' : '—'}`);
        } catch (e) {}
        try {
            if (menu && menu.isOpen)
                refreshPopup({...data, temp});
        } catch (e) {}
        return GLib.SOURCE_CONTINUE;
    };

    // menu created below; timer uses updateLabels which calls refreshPopup when open

    let menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    // Live-updating popup — one sample path, no second readAll()
    const usageValue = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-value'});
    const tempValue = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-value'});
    const loadValue = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-value'});
    const thermalCurrent = new St.Label({text: 'Current: —', style_class: 'material-panel-cpu-popup-thermal-row'});
    const thermalHigh = new St.Label({text: '', style_class: 'material-panel-cpu-popup-thermal-row'});
    const thermalCrit = new St.Label({text: '', style_class: 'material-panel-cpu-popup-thermal-row'});
    const coresGrid = new St.BoxLayout({vertical: true, style_class: 'material-panel-cpu-popup-cores'});
    const coreLabels = [];

    const header = new PopupMenu.PopupMenuSection();
    const headerBox = new St.BoxLayout({vertical: true, style_class: 'material-panel-cpu-popup-header', x_expand: true});
    headerBox.add_child(new St.Label({text: 'CPU', style_class: 'material-panel-cpu-popup-title'}));
    const summary = new St.BoxLayout({vertical: false, style_class: 'material-panel-cpu-popup-summary', x_expand: true});
    for (const [title, widget] of [['Usage', usageValue], ['Temp', tempValue], ['Load', loadValue]]) {
        const col = new St.BoxLayout({vertical: true, style_class: 'material-panel-cpu-popup-stat', x_expand: true});
        col.add_child(new St.Label({text: title, style_class: 'material-panel-cpu-popup-label'}));
        col.add_child(widget);
        summary.add_child(col);
    }
    headerBox.add_child(summary);
    header.actor.add_child(headerBox);
    menu.addMenuItem(header);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const coresSection = new PopupMenu.PopupMenuSection();
    const coresTitle = new St.Label({text: 'Per core', style_class: 'material-panel-cpu-popup-section-title'});
    coresSection.actor.add_child(coresTitle);
    coresSection.actor.add_child(coresGrid);
    menu.addMenuItem(coresSection);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const thermalSection = new PopupMenu.PopupMenuSection();
    thermalSection.actor.add_child(new St.Label({
        text: zoneName ? `Thermal · ${zoneName}` : 'Thermal',
        style_class: 'material-panel-cpu-popup-section-title',
    }));
    const thermalGrid = new St.BoxLayout({vertical: true, style_class: 'material-panel-cpu-popup-thermal'});
    thermalGrid.add_child(thermalCurrent);
    thermalGrid.add_child(thermalHigh);
    thermalGrid.add_child(thermalCrit);
    thermalSection.actor.add_child(thermalGrid);
    menu.addMenuItem(thermalSection);

    const ensureCoreRows = (n) => {
        while (coreLabels.length < n) {
            const i = coreLabels.length;
            const row = new St.BoxLayout({style_class: 'material-panel-cpu-popup-core-row', x_expand: true});
            row.add_child(new St.Label({text: `${i}`, style_class: 'material-panel-cpu-popup-core-name'}));
            // simple bar + pct
            const barBg = new St.Widget({
                style_class: 'material-panel-cpu-popup-bar-bg',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const barFill = new St.Widget({
                style_class: 'material-panel-cpu-popup-bar-fill',
                height: 6,
            });
            barBg.add_child(barFill);
            const val = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-core-value'});
            row.add_child(barBg);
            row.add_child(val);
            coresGrid.add_child(row);
            coreLabels.push({val, barFill, barBg});
        }
        coresTitle.visible = n > 0;
        coresGrid.visible = n > 0;
    };

    refreshPopup = (data = null) => {
        // Prefer data from the same tick; only sample if opened mid-cycle
        let totalPct, cores, temp;
        if (data && data.totalPct !== undefined) {
            totalPct = data.totalPct;
            cores = data.cores;
            temp = data.temp;
        } else {
            ({totalPct, cores} = readAll());
            temp = readTemp(tempPath);
            if (temp === null) temp = readTempHwmon();
        }
        const load = readLoadAvg();
        const trips = zoneName ? readTripPoints(zoneName) : {high: null, critical: null};

        usageValue.text = totalPct !== null ? `${totalPct}%` : '…';
        tempValue.text = temp !== null ? `${temp}°C` : '—';
        loadValue.text = load ? `${load.load1}` : '—';
        try {
            loadValue.set_tooltip_text(load ? `1 / 5 / 15 min: ${load.load1} ${load.load5} ${load.load15}` : '');
        } catch (e) {}

        const list = Array.isArray(cores) ? cores : [];
        ensureCoreRows(list.length);
        for (let i = 0; i < coreLabels.length; i++) {
            const c = list[i];
            const pct = c && typeof c === 'object' ? c.pct : c;
            const {val, barFill, barBg} = coreLabels[i];
            if (pct != null) {
                val.text = `${pct}%`;
                const w = Math.max(0, Math.min(100, pct));
                try {
                    const bw = barBg.width > 1 ? barBg.width : 80;
                    barFill.width = Math.round((bw * w) / 100);
                } catch (e) {
                    barFill.width = Math.round(w * 0.8);
                }
            } else {
                val.text = '…';
                barFill.width = 0;
            }
        }

        thermalCurrent.text = `Now  ${temp !== null ? temp + '°C' : '—'}`;
        thermalHigh.text = trips.high != null ? `High  ${trips.high}°C` : '';
        thermalCrit.text = trips.critical != null ? `Crit  ${trips.critical}°C` : '';
    };

    updateLabels();
    const timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, updateLabels);
    menu.connect('open-state-changed', (_m, open) => {
        if (open)
            refreshPopup(); // may show … for one tick until next sample
    });

    button.connect('clicked', () => menu.toggle());
    button.connect('destroy', () => {
        try { GLib.source_remove(timerId); } catch (e) {}
        menu.destroy();
    });

    return button;
}