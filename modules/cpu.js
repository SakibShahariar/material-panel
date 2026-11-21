import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import {isSessionLocked} from '../lib/shellCompat.js';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';
import {getNetworkSpeedUnit} from '../lib/networkSpeedUnit.js';
import {createAdaptivePollSchedule} from '../lib/adaptivePolling.js';
import {getGpuMetrics, getNetworkMetrics} from '../lib/systemMetricsState.js';
import {ConfigStore} from '../lib/configStore.js';
import {parseProcessSnapshot} from '../lib/processSnapshot.js';
import {readMemInfo} from '../lib/memInfo.js';
import {createActivityPopup} from '../lib/activityPopup.js';

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

// Keep the successful hwmon sensor path between samples. Discovery is
// synchronous I/O, so negative results are cached briefly instead of walking
// sysfs on every visible CPU refresh tick.
let cachedHwmonTempPath = null;
let lastHwmonDiscoveryAt = 0;
const HWMON_RETRY_INTERVAL_US = 30 * 1000000;

function readTempHwmon() {
    if (cachedHwmonTempPath) {
        const temp = readTemp(cachedHwmonTempPath);
        if (temp !== null)
            return temp;
        cachedHwmonTempPath = null;
    }
    const now = GLib.get_monotonic_time();
    if (now - lastHwmonDiscoveryAt < HWMON_RETRY_INTERVAL_US)
        return null;
    lastHwmonDiscoveryAt = now;
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
                        if (temp !== null) {
                            cachedHwmonTempPath = tempPath;
                            try { enumerator.close(null); } catch (e) {}
                            return temp;
                        }
                    }
                }
            } catch (e) {}
        }
        enumerator.close(null);
    } catch (e) {}
    return null;
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


// CPU topology/capacity metadata is stable for the lifetime of this module.
// Cache it so popup refreshes do not repeatedly walk sysfs.
let cachedCoreClasses;
let coreClassesRead = false;

function getCoreClasses() {
    if (!coreClassesRead) {
        cachedCoreClasses = readCoreClasses();
        coreClassesRead = true;
    }
    return cachedCoreClasses;
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

    let prevCores = [];
    let primed = false;
    let activityCycleIndex = 0;
    let activityMetrics = ['cpu', 'temperature'];
    let activityMode = 'combined';
    let coreClassesForPopup = null;

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

    let latestMetricSample = null;
    let latestMem = null;

    // Bounded history for the popup's mini graphs. Samples are collected only
    // while the chip or popup is visible — the helper never starts a sampler.
    const HISTORY_LEN = 28;
    const history = {cpu: [], temp: [], mem: []};
    const pushHistory = (cpuPct, tempC, memPct) => {
        if (Number.isFinite(cpuPct))
            history.cpu.push(Math.max(0, Math.min(100, cpuPct)));
        if (Number.isFinite(tempC))
            history.temp.push(Math.max(0, Math.min(100, tempC)));
        if (Number.isFinite(memPct))
            history.mem.push(Math.max(0, Math.min(100, memPct)));
        for (const key of Object.keys(history)) {
            if (history[key].length > HISTORY_LEN)
                history[key].splice(0, history[key].length - HISTORY_LEN);
        }
    };

    let processSnapshot = null;
    let processError = false;
    let processRefreshInFlight = false;
    let processCancellable = null;
    let processLastRefresh = 0;
    let processDestroyed = false;

    const requestProcessSnapshot = () => {
        if (processRefreshInFlight || processDestroyed)
            return;
        processRefreshInFlight = true;
        processCancellable = new Gio.Cancellable();
        try {
            const proc = Gio.Subprocess.new(
                ['env', 'LC_ALL=C', 'ps', '-eo', 'pid,pcpu,pmem,comm', '--no-headers'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            proc.communicate_utf8_async(null, processCancellable, (p, res) => {
                try {
                    const [, stdout, stderr] = p.communicate_utf8_finish(res);
                    if (!p.get_successful())
                        throw new Error(stderr || 'ps command failed');
                    processSnapshot = parseProcessSnapshot(stdout || '');
                    processError = false;
                    processLastRefresh = GLib.get_monotonic_time();
                } catch (e) {
                    if (!processCancellable?.is_cancelled?.()) {
                        processError = true;
                        processSnapshot = null;
                        logError(e, 'material-panel: process snapshot failed');
                    }
                } finally {
                    processRefreshInFlight = false;
                    processCancellable = null;
                    if (!processDestroyed)
                        popup.update();
                }
            });
        } catch (e) {
            processRefreshInFlight = false;
            processCancellable = null;
            processError = true;
            processSnapshot = null;
            logError(e, 'material-panel: unable to start process snapshot');
        }
    };

    const refreshProcesses = () => {
        const now = GLib.get_monotonic_time();
        if (!processRefreshInFlight &&
            (processLastRefresh === 0 || now - processLastRefresh >= 5 * 1000 * 1000))
            requestProcessSnapshot();
    };

    const openMonitor = () => {
        for (const command of ['gnome-system-monitor', 'missioncenter', 'plasma-systemmonitor']) {
            try { GLib.spawn_command_line_async(command); break; } catch (e) {}
        }
    };

    let popup = null;
    popup = createActivityPopup({
        button,
        openMonitor,
        refreshProcesses,
        getData: () => {
            let coreClasses = null;
            try { coreClasses = getCoreClasses(); } catch (e) {}
            return {
                totalPct: latestMetricSample?.totalPct ?? null,
                cores: latestMetricSample?.cores ?? [],
                temp: latestMetricSample?.temp ?? null,
                history,
                coreClasses,
                mem: {
                    usedPct: latestMem?.usedPct ?? null,
                    used: formatBytesFromKb(latestMem?.usedKb),
                    total: formatBytesFromKb(latestMem?.totalKb),
                    available: formatBytesFromKb(latestMem?.availableKb),
                    cache: formatBytesFromKb(latestMem?.cachedKb),
                    swap: latestMem?.swapTotalKb > 0
                        ? `${formatBytesFromKb(latestMem.swapUsedKb)} / ${formatBytesFromKb(latestMem.swapTotalKb)} (${latestMem.swapPct}%)`
                        : 'none',
                },
            };
        },
        getProcesses: () => ({
            rows: processSnapshot,
            loading: processRefreshInFlight || processSnapshot === null,
            error: processError,
        }),
    });

    let updateLabels = (force = false) => {
        if (!force && (isSessionLocked() || (!button.mapped && !popup.isOpen)))
            return GLib.SOURCE_CONTINUE;
        try {
            getCoreClasses();
        } catch (e) {}
        // Single sample per tick — calling readAll twice ate the delta.
        const data = readAll();
        const totalPct = data.totalPct;
        let temp = readTemp(tempPath);
        if (temp === null) temp = readTempHwmon();
        latestMetricSample = {...data, temp};
        const metrics = activityMetrics;
        const mode = activityMode;
        const memSnap = (metrics.includes('memory') || popup.isOpen) ? readMemInfo() : null;
        if (memSnap)
            latestMem = memSnap;
        pushHistory(totalPct, temp, memSnap?.usedPct ?? null);
        const gpu = getGpuMetrics();
        const freshGpu = gpu && GLib.get_monotonic_time() - gpu.updatedAt < 10000000;
        const network = getNetworkMetrics();
        const now = GLib.get_monotonic_time();
        const values = [];
        if (metrics.includes('cpu')) {
            const text = totalPct !== null ? totalPct + '%' : '—';
            values.push({id: 'cpu', text, label: 'CPU ' + text});
        }
        if (metrics.includes('memory')) {
            const text = memSnap ? memSnap.usedPct + '%' : '—';
            values.push({id: 'memory', text: 'RAM ' + text, label: 'RAM ' + text});
        }
        if (metrics.includes('temperature')) {
            const text = temp !== null ? temp + '°' : '—';
            values.push({id: 'temperature', text, label: 'TEMP ' + text});
        }
        if (metrics.includes('gpu')) {
            values.push({id: 'gpu', text: 'GPU ' + (freshGpu && gpu.util != null ? gpu.util + '%' : '—')});
        }
        if (metrics.includes('network')) {
            const freshNetwork = network && now - network.updatedAt < 5000000;
            const compactRate = value => {
                const n = Math.max(0, Number(value) || 0);
                const bits = getNetworkSpeedUnit() === 'bits';
                const amount = bits ? n * 8 : n;
                if (amount < 1000) return Math.round(amount) + (bits ? 'b' : 'B');
                if (amount < 1000000) return Math.round(amount / 1000) + 'K';
                return (amount / 1000000).toFixed(1) + 'M';
            };
            values.push({
                id: 'network',
                text: freshNetwork ? 'NET ' + compactRate(network.down) + '/' + compactRate(network.up) : 'NET —',
            });
        }
        if (values.length === 0) {
            const text = totalPct !== null ? totalPct + '%' : '—';
            values.push({id: 'cpu', text, label: 'CPU ' + text});
        }
        const displayed = mode === 'cycle' ? [values[activityCycleIndex++ % values.length]] : values;
        const displayedIds = new Set(displayed.map(value => value.id));
        try { cpuIcon.visible = displayedIds.has('cpu'); } catch (e) {}
        try { tempIcon.visible = displayedIds.has('temperature'); } catch (e) {}
        cpuLabel.text = displayed.filter(value => value.id !== 'temperature')
            .map(value => value.text).join(' · ');
        tempLabel.text = displayed.filter(value => value.id === 'temperature')
            .map(value => value.text).join(' ');
        try {
            const hot = (metrics.includes('cpu') && totalPct != null && totalPct >= 90) ||
                (metrics.includes('memory') && memSnap && memSnap.usedPct >= 90) ||
                (metrics.includes('gpu') && freshGpu && gpu.util >= 90);
            if (hot)
                button.add_style_class_name('material-panel-chip-warn');
            else
                button.remove_style_class_name('material-panel-chip-warn');
        } catch (e) {}
        try {
            const summary = values.map(value => value.label ?? value.text).join('  ');
            button.set_tooltip_text(summary);
            setChipA11y(button, 'System statistics: ' + summary);
        } catch (e) {}
        if (popup.isOpen) {
            try { popup.update(); } catch (e) {}
        }
        return GLib.SOURCE_CONTINUE;
    };

    const _cfgStore = new ConfigStore();
    let activityConfigGeneration = 0;
    const _applyActivityMode = async () => {
        const generation = ++activityConfigGeneration;
        try {
            const c = await _cfgStore.loadAsync();
            if (processDestroyed || generation !== activityConfigGeneration)
                return;
            activityMetrics = Array.isArray(c.activityChipMetrics)
                ? [...c.activityChipMetrics]
                : ['cpu', 'temperature'];
            activityMode = c.activityChipMode === 'cycle' ? 'cycle' : 'combined';
            try { popup.setOpacity(c.panelSize?.popupOpacity); } catch (e) {}
            try { updateLabels(); } catch (e) {}
        } catch (e) {
            if (!processDestroyed && generation === activityConfigGeneration) {
                activityMetrics = ['cpu', 'temperature'];
                activityMode = 'combined';
                logError(e, 'material-panel: asynchronous activity config load');
            }
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
    // The chip may not report as mapped while the panel is still being built;
    // populate the labels once unconditionally and again as soon as it maps.
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        try { updateLabels(true); } catch (e) {}
        return GLib.SOURCE_REMOVE;
    });
    try {
        button.connect('notify::mapped', () => {
            if (button.mapped) {
                try { updateLabels(true); } catch (e) {}
            }
        });
    } catch (e) {}
    let previousCpuPct = Number.isFinite(latestMetricSample?.totalPct)
        ? latestMetricSample.totalPct
        : null;
    const cpuSchedule = createAdaptivePollSchedule({
        baseIntervalMs: 2000,
        minIntervalMs: 2000,
        maxIntervalMs: 5000,
        stableSamplesToSlow: 4,
        growthFactor: 1.25,
        jitterRatio: 0.05,
    });
    let timerId = 0;
    const scheduleCpuSample = (active = false) => {
        const delayMs = cpuSchedule.nextDelay(active);
        timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            timerId = 0;
            if (isSessionLocked() || (!button.mapped && !popup.isOpen)) {
                primed = false;
                prevCores = [];
                previousCpuPct = null;
                cpuSchedule.reset();
            } else {
                updateLabels();
                const currentCpuPct = latestMetricSample?.totalPct;
                const active = Number.isFinite(currentCpuPct) && (
                    currentCpuPct >= 20 ||
                    (previousCpuPct !== null && Math.abs(currentCpuPct - previousCpuPct) >= 5)
                );
                if (Number.isFinite(currentCpuPct))
                    previousCpuPct = currentCpuPct;
                scheduleCpuSample(active);
                return GLib.SOURCE_REMOVE;
            }
            scheduleCpuSample(false);
            return GLib.SOURCE_REMOVE;
        });
    };
    scheduleCpuSample();

    button.connect('clicked', () => popup.toggle());
    button.connect('destroy', () => {
        processDestroyed = true;
        activityConfigGeneration++;
        try { processCancellable?.cancel(); } catch (e) {}
        try { GLib.source_remove(timerId); } catch (e) {}
        try { _cfgStore.unwatch(); } catch (e) {}
        try { popup.destroy(); } catch (e) {}
    });

    try { setChipA11y(button, 'Activity'); } catch (e) {}
    try { wireChipPress(button, {stickyUntilLeave: false}); } catch (e) {}
    return button;
}
