import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuToggle} from '../lib/shellCompat.js';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';
import {ConfigStore} from '../lib/configStore.js';

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


function readMemInfo() {
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/meminfo').load_contents(null);
        if (!ok) return null;
        const text = new TextDecoder('utf-8').decode(contents);
        const map = {};
        for (const line of text.split('\n')) {
            const m = line.match(/^(\w+):\s+(\d+)/);
            if (m)
                map[m[1]] = parseInt(m[2], 10); // kB
        }
        const total = map.MemTotal ?? 0;
        const available = map.MemAvailable ?? map.MemFree ?? 0;
        const free = map.MemFree ?? 0;
        const buffers = map.Buffers ?? 0;
        const cached = (map.Cached ?? 0) + (map.SReclaimable ?? 0);
        const used = Math.max(0, total - available);
        const swapTotal = map.SwapTotal ?? 0;
        const swapFree = map.SwapFree ?? 0;
        const swapUsed = Math.max(0, swapTotal - swapFree);
        return {
            totalKb: total,
            availableKb: available,
            usedKb: used,
            freeKb: free,
            cachedKb: cached,
            buffersKb: buffers,
            usedPct: total > 0 ? Math.round((used / total) * 100) : 0,
            swapTotalKb: swapTotal,
            swapUsedKb: swapUsed,
            swapPct: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0,
        };
    } catch (e) {
        return null;
    }
}

function formatBytesFromKb(kb) {
    if (kb == null || !Number.isFinite(kb))
        return '—';
    const mb = kb / 1024;
    if (mb < 1024)
        return `${mb.toFixed(0)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
}

function readDiskRoot() {
    try {
        const file = Gio.File.new_for_path('/');
        const info = file.query_filesystem_info(
            'filesystem::size,filesystem::used,filesystem::free', null);
        const size = Number(info.get_attribute_uint64('filesystem::size'));
        const used = Number(info.get_attribute_uint64('filesystem::used'));
        const free = Number(info.get_attribute_uint64('filesystem::free'));
        if (!Number.isFinite(size) || size <= 0)
            return null;
        const usedN = Number.isFinite(used) && used > 0
            ? used
            : Math.max(0, size - (Number.isFinite(free) ? free : 0));
        const avail = Number.isFinite(free) ? free : Math.max(0, size - usedN);
        return {
            size,
            used: usedN,
            avail,
            pct: Math.round((usedN / size) * 100),
            mount: '/',
        };
    } catch (e) {
        return null;
    }
}

function formatBytes(n) {
    if (n == null || !Number.isFinite(n))
        return '—';
    if (n < 1024)
        return `${n} B`;
    if (n < 1024 * 1024)
        return `${(n / 1024).toFixed(0)} KB`;
    if (n < 1024 ** 3)
        return `${(n / (1024 ** 2)).toFixed(1)} MB`;
    return `${(n / (1024 ** 3)).toFixed(1)} GB`;
}

function readNetRates() {
    // cumulative bytes; caller diffs
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/net/dev').load_contents(null);
        if (!ok) return null;
        const text = new TextDecoder('utf-8').decode(contents);
        let rx = 0, tx = 0;
        for (const line of text.split('\n').slice(2)) {
            const t = line.trim();
            if (!t) continue;
            const [iface, rest] = t.split(':');
            if (!rest) continue;
            const name = iface.trim();
            if (name === 'lo') continue;
            const parts = rest.trim().split(/\s+/);
            rx += parseInt(parts[0], 10) || 0;
            tx += parseInt(parts[8], 10) || 0;
        }
        return {rx, tx, t: GLib.get_monotonic_time()};
    } catch (e) {
        return null;
    }
}

function readTopProcesses(limit = 12, sortBy = 'cpu') {
    try {
        const sort = sortBy === 'mem' ? '-pmem' : '-pcpu';
        const [, out] = GLib.spawn_command_line_sync(
            `ps -eo pid,pcpu,pmem,comm --sort=${sort} --no-headers`);
        const text = new TextDecoder('utf-8').decode(out);
        const rows = [];
        for (const line of text.split('\n')) {
            const t = line.trim();
            if (!t) continue;
            const parts = t.split(/\s+/);
            if (parts.length < 4) continue;
            const pid = parts[0];
            const pcpu = parts[1];
            const pmem = parts[2];
            const comm = parts.slice(3).join(' ');
            if (comm === 'ps') continue;
            rows.push({pid, pcpu, pmem, comm});
            if (rows.length >= limit)
                break;
        }
        return rows;
    } catch (e) {
        return [];
    }
}


function readGpuInfo() {
    try {
        const [, out] = GLib.spawn_command_line_sync(
            'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits');
        const text = new TextDecoder('utf-8').decode(out).trim();
        if (text && !/error|not found|failed/i.test(text)) {
            const line = text.split('\n')[0];
            const parts = line.split(',').map(s => s.trim());
            if (parts.length >= 4) {
                return {
                    vendor: 'NVIDIA',
                    util: parseInt(parts[0], 10),
                    memUsed: parseInt(parts[1], 10),
                    memTotal: parseInt(parts[2], 10),
                    temp: parseInt(parts[3], 10),
                };
            }
        }
    } catch (e) {}
    try {
        const base = '/sys/class/drm/card0/device';
        let util = null, temp = null, memUsed = null, memTotal = null;
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
            return {vendor: 'AMD', util, memUsed, memTotal, temp};
    } catch (e) {}
    return null;
}

function killProcess(pid) {
    const n = parseInt(pid, 10);
    if (!Number.isFinite(n) || n <= 1)
        return false;
    try {
        GLib.spawn_command_line_async(`kill -TERM ${n}`);
    } catch (e) {
        try {
            GLib.spawn_command_line_async(`kill ${n}`);
        } catch (e2) {
            return false;
        }
    }
    // Escalate if still alive after ~1.2s
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200, () => {
        try {
            const [, out] = GLib.spawn_command_line_sync(`ps -p ${n} -o pid=`);
            const still = new TextDecoder('utf-8').decode(out).trim();
            if (still)
                GLib.spawn_command_line_async(`kill -KILL ${n}`);
        } catch (e) {}
        return GLib.SOURCE_REMOVE;
    });
    return true;
}


function readCoreClasses() {
    // Map cpu index → 'P' | 'E' | 'L' | null using max freq clusters or capacity.
    const maxHz = [];
    const capacity = [];
    try {
        const dir = Gio.File.new_for_path('/sys/devices/system/cpu');
        const en = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = en.next_file(null)) !== null) {
            const name = info.get_name();
            const m = name.match(/^cpu(\d+)$/);
            if (!m) continue;
            const idx = parseInt(m[1], 10);
            try {
                const [ok, c] = Gio.File.new_for_path(
                    `/sys/devices/system/cpu/${name}/cpufreq/cpuinfo_max_freq`).load_contents(null);
                if (ok)
                    maxHz[idx] = parseInt(new TextDecoder('utf-8').decode(c).trim(), 10);
            } catch (e) {}
            try {
                const [ok, c] = Gio.File.new_for_path(
                    `/sys/devices/system/cpu/${name}/cpu_capacity`).load_contents(null);
                if (ok)
                    capacity[idx] = parseInt(new TextDecoder('utf-8').decode(c).trim(), 10);
            } catch (e) {}
        }
        try { en.close(null); } catch (e) {}
    } catch (e) {}

    const n = Math.max(maxHz.length, capacity.length);
    if (n === 0)
        return null;

    // Prefer capacity (ARM big.LITTLE / Intel on some kernels)
    const caps = [];
    for (let i = 0; i < n; i++) {
        if (capacity[i] != null)
            caps.push(capacity[i]);
    }
    const uniqueCap = [...new Set(caps)].sort((a, b) => a - b);
    if (uniqueCap.length >= 2) {
        const out = [];
        const hi = uniqueCap[uniqueCap.length - 1];
        const lo = uniqueCap[0];
        for (let i = 0; i < n; i++) {
            const c = capacity[i];
            if (c == null) out[i] = null;
            else if (c >= hi) out[i] = 'P';
            else if (c <= lo) out[i] = 'E';
            else out[i] = 'L'; // mid / low-power island
        }
        return out;
    }

    // Fallback: max frequency clusters
    const freqs = [];
    for (let i = 0; i < n; i++) {
        if (maxHz[i] != null)
            freqs.push(maxHz[i]);
    }
    const uniqueF = [...new Set(freqs)].sort((a, b) => a - b);
    if (uniqueF.length < 2)
        return null;
    // Split at midpoint between min and max unique
    const mid = (uniqueF[0] + uniqueF[uniqueF.length - 1]) / 2;
    const out = [];
    for (let i = 0; i < n; i++) {
        const f = maxHz[i];
        if (f == null) out[i] = null;
        else if (f >= mid) out[i] = 'P';
        else out[i] = 'E';
    }
    return out;
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
        orientation: Clutter.Orientation.HORIZONTAL,
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
        try {
            if (!globalThis._materialPanelCoreClasses)
                globalThis._materialPanelCoreClasses = readCoreClasses();
        } catch (e) {}
        // Single sample per tick — calling readAll twice ate the delta (popup stuck ~0%)
        const data = readAll();
        const totalPct = data.totalPct;
        let temp = readTemp(tempPath);
        if (temp === null) temp = readTempHwmon();
        let mode = 'cpu';
        try {
            mode = globalThis._materialPanelActivityChip || 'cpu';
        } catch (e) {}
        const memSnap = readMemInfo();
        if (mode === 'ram') {
            cpuLabel.text = memSnap ? `${memSnap.usedPct}%` : '—';
            tempLabel.text = memSnap ? 'RAM' : '';
            try { tempIcon.visible = false; } catch (e) {}
        } else if (mode === 'cpu-ram') {
            cpuLabel.text = totalPct !== null ? `${totalPct}%` : '—';
            tempLabel.text = memSnap ? `${memSnap.usedPct}%RAM` : (temp !== null ? `${temp}°C` : '');
            try { tempIcon.visible = true; } catch (e) {}
        } else {
            if (totalPct !== null) cpuLabel.text = `${totalPct}%`;
            else cpuLabel.text = '—';
            if (temp !== null) tempLabel.text = `${temp}°C`;
            else tempLabel.text = '';
            try { tempIcon.visible = true; } catch (e) {}
        }
        try {
            const hot = (totalPct != null && totalPct >= 90) ||
                (mode === 'ram' && memSnap && memSnap.usedPct >= 90) ||
                (mode === 'cpu-ram' && memSnap && memSnap.usedPct >= 90);
            if (hot)
                button.add_style_class_name('material-panel-chip-warn');
            else
                button.remove_style_class_name('material-panel-chip-warn');
        } catch (e) {}
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

    // —— Activity popup (section-based — reliable with PopupMenu.open) ——
    const usageValue = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-value'});
    const tempValue = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-value'});
    const loadValue = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-value'});
    const thermalSensor = new St.Label({text: '', style_class: 'material-panel-cpu-popup-thermal-row'});
    const thermalCurrent = new St.Label({text: '', style_class: 'material-panel-cpu-popup-thermal-row'});
    const thermalHigh = new St.Label({text: '', style_class: 'material-panel-cpu-popup-thermal-row'});
    const thermalCrit = new St.Label({text: '', style_class: 'material-panel-cpu-popup-thermal-row'});
    const coresGrid = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'material-panel-cpu-popup-cores'});
    const coreLabels = [];

    const header = new PopupMenu.PopupMenuSection();
    const headerBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-cpu-popup-header',
        x_expand: true,
        style: 'spacing: 8px; padding: 4px 2px; min-width: 260px;',
    });
    headerBox.add_child(new St.Label({text: 'Activity', style_class: 'material-panel-cpu-popup-title'}));
    const summary = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        style_class: 'material-panel-cpu-popup-summary',
        x_expand: true,
        style: 'spacing: 12px;',
    });
    for (const [title, widget] of [['Usage', usageValue], ['Temp', tempValue], ['Load', loadValue]]) {
        const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'material-panel-cpu-popup-stat', x_expand: true});
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
    try {
        const cc = readCoreClasses();
        if (cc && cc.some(x => x === 'P' || x === 'E'))
            coresTitle.text = 'Per core  (P = performance, E = efficiency)';
        globalThis._materialPanelCoreClasses = cc;
    } catch (e) {}
    coresSection.actor.add_child(coresTitle);
    coresSection.actor.add_child(coresGrid);
    menu.addMenuItem(coresSection);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Memory
    const memUsedLbl = new St.Label({text: 'Used  —', style_class: 'material-panel-cpu-popup-value'});
    const memAvailLbl = new St.Label({text: 'Available  —', style_class: 'material-panel-cpu-popup-value'});
    const memCacheLbl = new St.Label({text: 'Cache  —', style_class: 'material-panel-cpu-popup-value'});
    const memSwapLbl = new St.Label({text: 'Swap  —', style_class: 'material-panel-cpu-popup-value'});
    const memSection = new PopupMenu.PopupMenuSection();
    memSection.actor.add_child(new St.Label({
        text: 'Memory',
        style_class: 'material-panel-cpu-popup-section-title',
    }));
    const memBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'material-panel-cpu-popup-thermal', style: 'spacing: 2px;'});
    memBox.add_child(memUsedLbl);
    memBox.add_child(memAvailLbl);
    memBox.add_child(memCacheLbl);
    memBox.add_child(memSwapLbl);
    memSection.actor.add_child(memBox);
    menu.addMenuItem(memSection);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Expand
    let expanded = false;
    const expandBtn = new PopupMenu.PopupMenuItem('Show more ▸');
    menu.addMenuItem(expandBtn);

    const extraSection = new PopupMenu.PopupMenuSection();
    extraSection.actor.visible = false;
    const diskLbl = new St.Label({text: 'Disk  —', style_class: 'material-panel-cpu-popup-value'});
    const netLbl = new St.Label({text: 'Network  —', style_class: 'material-panel-cpu-popup-value'});
    const gpuLbl = new St.Label({text: 'GPU  —', style_class: 'material-panel-cpu-popup-value'});
    const ioBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style: 'spacing: 3px; padding: 2px 0;'});
    ioBox.add_child(new St.Label({text: 'System', style_class: 'material-panel-cpu-popup-section-title'}));
    ioBox.add_child(diskLbl);
    ioBox.add_child(netLbl);
    ioBox.add_child(gpuLbl);
    extraSection.actor.add_child(ioBox);

    let procSort = 'cpu';
    const procTitleRow = new St.BoxLayout({orientation: Clutter.Orientation.HORIZONTAL, style: 'spacing: 8px;'});
    const procTitle = new St.Label({
        text: 'Top processes',
        style_class: 'material-panel-cpu-popup-section-title',
        x_expand: true,
    });
    const sortCpuBtn = new St.Button({label: 'CPU', style_class: 'material-panel-headphones-disconnect'});
    const sortMemBtn = new St.Button({label: 'MEM', style_class: 'material-panel-headphones-disconnect'});
    sortCpuBtn.connect('clicked', () => { procSort = 'cpu'; refreshExtra(); });
    sortMemBtn.connect('clicked', () => { procSort = 'mem'; refreshExtra(); });
    procTitleRow.add_child(procTitle);
    procTitleRow.add_child(sortCpuBtn);
    procTitleRow.add_child(sortMemBtn);

    let procFilter = '';
    const procSearch = new St.Entry({
        style_class: 'material-panel-activity-proc-search',
        hint_text: 'Filter processes…',
        can_focus: true,
        x_expand: true,
    });
    try {
        procSearch.clutter_text.connect('text-changed', () => {
            try {
                procFilter = String(procSearch.get_text() || '').trim().toLowerCase();
            } catch (e) {
                procFilter = '';
            }
            try { refreshExtra(); } catch (e) {}
        });
    } catch (e) {}

    const procBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-cpu-popup-procs',
        style: 'spacing: 2px;',
    });
    const procScroll = new St.ScrollView({
        style_class: 'material-panel-cpu-proc-scroll',
        overlay_scrollbars: true,
        x_expand: true,
    });
    try {
        procScroll.hscrollbar_policy = St.PolicyType.NEVER;
        procScroll.vscrollbar_policy = St.PolicyType.AUTOMATIC;
    } catch (e) {}
    try { procScroll.style = 'max-height: 240px;'; } catch (e) {}
    try {
        if (procScroll.set_child)
            procScroll.set_child(procBox);
        else
            procScroll.add_child(procBox);
    } catch (e) {
        try { procScroll.add_actor?.(procBox); } catch (e2) {}
    }

    const sysMonBtn = new St.Button({
        label: 'System Monitor',
        style_class: 'material-panel-headphones-disconnect',
        x_expand: true,
    });
    sysMonBtn.connect('clicked', () => {
        for (const c of ['gnome-system-monitor', 'missioncenter', 'plasma-systemmonitor']) {
            try { GLib.spawn_command_line_async(c); break; } catch (e) {}
        }
        try { if (menu.isOpen) menuToggle(menu); } catch (e) {}
    });

    extraSection.actor.add_child(procTitleRow);
    extraSection.actor.add_child(procSearch);
    extraSection.actor.add_child(procScroll);
    extraSection.actor.add_child(sysMonBtn);
    menu.addMenuItem(extraSection);

    expandBtn.connect('activate', () => {
        expanded = !expanded;
        extraSection.actor.visible = expanded;
        try {
            if (expandBtn.label && expandBtn.label.set_text)
                expandBtn.label.set_text(expanded ? 'Show less ▾' : 'Show more ▸');
            else if (expandBtn.label)
                expandBtn.label.text = expanded ? 'Show less ▾' : 'Show more ▸';
        } catch (e) {}
        if (expanded)
            refreshExtra();
    });

    const ensureCoreRows = (n) => {
        while (coreLabels.length < n) {
            const i = coreLabels.length;
            const row = new St.BoxLayout({style_class: 'material-panel-cpu-popup-core-row', x_expand: true, style: 'spacing: 6px;'});
            const coreClasses = globalThis._materialPanelCoreClasses || null;
            const tag = coreClasses && coreClasses[i] ? coreClasses[i] : '';
            const nameText = tag ? `${i} ${tag}` : `${i}`;
            row.add_child(new St.Label({text: nameText, style_class: 'material-panel-cpu-popup-core-name'}));
            const barBg = new St.Widget({
                style_class: 'material-panel-cpu-popup-bar-bg',
                x_expand: true,
                height: 8,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const barFill = new St.Widget({
                style_class: 'material-panel-cpu-popup-bar-fill',
                height: 8,
            });
            barBg.add_child(barFill);
            const val = new St.Label({text: '—', style_class: 'material-panel-cpu-popup-core-value'});
            row.add_child(barBg);
            row.add_child(val);
            coresGrid.add_child(row);
            coreLabels.push({val, barFill, barBg});
        }
        try {
            coresTitle.visible = n > 0;
            coresGrid.visible = n > 0;
        } catch (e) {}
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

        // Load averages in the Load column (1 / 5 / 15 min)
        loadValue.text = load
            ? `${load.load1} / ${load.load5} / ${load.load15}`
            : '—';

        const mem = readMemInfo();
        if (mem) {
            memUsedLbl.text = `Used  ${formatBytesFromKb(mem.usedKb)} / ${formatBytesFromKb(mem.totalKb)}  (${mem.usedPct}%)`;
            memAvailLbl.text = `Available  ${formatBytesFromKb(mem.availableKb)}`;
            memCacheLbl.text = `Cache  ${formatBytesFromKb(mem.cachedKb)}`;
            memSwapLbl.text = mem.swapTotalKb > 0
                ? `Swap  ${formatBytesFromKb(mem.swapUsedKb)} / ${formatBytesFromKb(mem.swapTotalKb)}  (${mem.swapPct}%)`
                : 'Swap  none';
        } else {
            memUsedLbl.text = 'Used  —';
            memAvailLbl.text = 'Available  —';
            memCacheLbl.text = 'Cache  —';
            memSwapLbl.text = 'Swap  —';
        }

        if (expanded)
            refreshExtra();
    };

    const _cfgStore = new ConfigStore();
    const _applyActivityMode = () => {
        try {
            const c = _cfgStore.load();
            globalThis._materialPanelActivityChip = c.activityChip || 'cpu';
        } catch (e) {
            globalThis._materialPanelActivityChip = 'cpu';
        }
    };
    _applyActivityMode();
    try {
        _cfgStore.watch(() => {
            _applyActivityMode();
            try { updateLabels(); } catch (e) {}
        });
    } catch (e) {}

    updateLabels();
    let timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, updateLabels);
    let fastTimerId = 0;
    menu.connect('open-state-changed', (_m, open) => {
        if (open) {
            refreshPopup();
            if (fastTimerId)
                return;
            fastTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                if (!menu.isOpen) {
                    fastTimerId = 0;
                    return GLib.SOURCE_REMOVE;
                }
                refreshPopup();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (fastTimerId) {
            try { GLib.source_remove(fastTimerId); } catch (e) {}
            fastTimerId = 0;
        }
    });

    button.connect('clicked', () => menuToggle(menu));
    button.connect('destroy', () => {
        try { GLib.source_remove(timerId); } catch (e) {}
        try { if (fastTimerId) GLib.source_remove(fastTimerId); } catch (e) {}
        try { _cfgStore.unwatch(); } catch (e) {}
        menu.destroy();
    });

    try { setChipA11y(button, 'Activity'); } catch (e) {}
    try { wireChipPress(button, {stickyUntilLeave: false}); } catch (e) {}
    return button;
}