import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import {readMemInfo} from '../lib/memInfo.js';
import {getNetworkMetrics} from '../lib/systemMetricsState.js';
import {parseProcessSnapshot, filterAndSortProcesses} from '../lib/processSnapshot.js';
import {getThemeColor} from '../lib/themeColorState.js';
import {calculateCpuPercent, parseTemperatureValue, formatNetworkRate} from '../lib/controlCenterMetrics.js';
import {readGpuInfoAsync} from './gpu.js';
import {setControlCenterMetrics} from '../lib/controlCenterSummaryState.js';

const HISTORY_LENGTH = 18;
const PROCESS_REFRESH_TICKS = 3;

function readCpuUsage(previous) {
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/stat').load_contents(null);
        if (!ok)
            return {value: null, previous};
        const line = new TextDecoder('utf-8').decode(contents)
            .split('\n').find(entry => entry.startsWith('cpu '));
        if (!line)
            return {value: null, previous};
        const values = line.trim().split(/\s+/).slice(1).map(Number);
        if (values.length < 4 || values.some(value => !Number.isFinite(value)))
            return {value: null, previous};
        const idle = (values[3] ?? 0) + (values[4] ?? 0);
        const total = values.reduce((sum, value) => sum + value, 0);
        if (!previous || total <= previous.total || idle < previous.idle)
            return {value: null, previous: {idle, total}};
        return {
            value: calculateCpuPercent(previous, {idle, total}),
            previous: {idle, total},
        };
    } catch (e) {
        return {value: null, previous};
    }
}

function findTemperaturePath() {
    try {
        const directory = Gio.File.new_for_path('/sys/class/thermal');
        const enumerator = directory.enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
        const candidates = [];
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (!name.startsWith('thermal_zone'))
                continue;
            const base = '/sys/class/thermal/' + name;
            let type = '';
            try {
                const [ok, contents] = Gio.File.new_for_path(base + '/type').load_contents(null);
                if (ok)
                    type = new TextDecoder('utf-8').decode(contents).trim();
            } catch (e) {}
            candidates.push({type, path: base + '/temp'});
        }
        try { enumerator.close(null); } catch (e) {}
        const preferred = ['x86_pkg_temp', 'Tctl', 'Tdie', 'cpu-thermal', 'cpu_thermal', 'acpitz'];
        for (const name of preferred) {
            const match = candidates.find(candidate =>
                candidate.type === name || candidate.type.startsWith(name));
            if (match)
                return match.path;
        }
        return candidates[0]?.path ?? null;
    } catch (e) {
        return null;
    }
}

function readTemperature(path) {
    if (!path)
        return null;
    try {
        const [ok, contents] = Gio.File.new_for_path(path).load_contents(null);
        if (!ok)
            return null;
        return parseTemperatureValue(new TextDecoder('utf-8').decode(contents));
    } catch (e) {
        return null;
    }
}


function metricCard(title, initialValue, description) {
    const card = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-control-center-card',
        x_expand: true,
    });
    card.style = 'background-color: ' + getThemeColor('qsSurface', 'rgba(49, 50, 68, 0.55)') +
        '; border-radius: 16px; padding: 12px; spacing: 6px;';
    const heading = new St.Label({text: title});
    heading.style = 'font-size: 12px; font-weight: 650;';
    const value = new St.Label({text: initialValue});
    value.style = 'font-size: 20px; font-weight: 700;';
    const trend = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        y_align: Clutter.ActorAlign.END,
    });
    trend.style = 'spacing: 2px; height: 30px;';
    const bars = [];
    for (let i = 0; i < HISTORY_LENGTH; i++) {
        const bar = new St.Widget({width: 4, height: 3});
        bar.style = 'background-color: ' + getThemeColor('primary', '#89b4fa') + '; border-radius: 2px;';
        trend.add_child(bar);
        bars.push(bar);
    }
    trend.accessible_name = description;
    const detail = new St.Label({text: description});
    detail.style = 'font-size: 10px; opacity: 0.72;';
    card.add_child(heading);
    card.add_child(value);
    card.add_child(trend);
    card.add_child(detail);
    const history = [];
    return {
        actor: card,
        value,
        update(number, text, accessibleText) {
            value.text = text;
            value.accessible_name = accessibleText;
            if (number === null || !Number.isFinite(number))
                return;
            history.push(Math.max(0, Math.min(100, number)));
            while (history.length > HISTORY_LENGTH)
                history.shift();
            const max = Math.max(10, ...history);
            bars.forEach((bar, index) => {
                const sample = history[index - (HISTORY_LENGTH - history.length)] ?? 0;
                bar.height = Math.max(3, Math.round(3 + (sample / max) * 24));
                bar.opacity = index < HISTORY_LENGTH - history.length ? 0.25 : 1;
            });
            trend.accessible_name = accessibleText + '; recent trend shown as bars';
        },
    };
}

export function buildControlCenterSystem() {
    const root = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-control-center-system',
        x_expand: true,
    });
    root.style = 'spacing: 10px;';

    const overviewTitle = new St.Label({text: 'System overview'});
    overviewTitle.style = 'font-size: 14px; font-weight: 700;';
    root.add_child(overviewTitle);

    const cpu = metricCard('CPU', 'Sampling…', 'CPU utilization percent');
    const memory = metricCard('Memory', '—', 'Used memory percent');
    const temperature = metricCard('CPU temperature', 'Unavailable', 'CPU temperature in degrees Celsius');
    const overview = new St.Widget({
        layout_manager: new Clutter.GridLayout(),
        x_expand: true,
    });
    overview.layout_manager.column_spacing = 8;
    overview.layout_manager.row_spacing = 8;
    overview.layout_manager.attach(cpu.actor, 0, 0, 1, 1);
    overview.layout_manager.attach(memory.actor, 1, 0, 1, 1);
    overview.layout_manager.attach(temperature.actor, 0, 1, 2, 1);
    root.add_child(overview);

    const networkCard = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-control-center-card',
        x_expand: true,
    });
    networkCard.style = 'background-color: ' + getThemeColor('qsSurface', 'rgba(49, 50, 68, 0.55)') +
        '; border-radius: 16px; padding: 12px; spacing: 5px;';
    const networkTitle = new St.Label({text: 'Network'});
    networkTitle.style = 'font-size: 12px; font-weight: 650;';
    const download = new St.Label({text: '↓ Download  —'});
    const upload = new St.Label({text: '↑ Upload  —'});
    const networkNote = new St.Label({text: 'Shared Network Speed sample'});
    networkNote.style = 'font-size: 10px; opacity: 0.72;';
    networkCard.add_child(networkTitle);
    networkCard.add_child(download);
    networkCard.add_child(upload);
    networkCard.add_child(networkNote);
    root.add_child(networkCard);

    const processCard = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-control-center-card',
        x_expand: true,
    });
    processCard.style = 'background-color: ' + getThemeColor('qsSurface', 'rgba(49, 50, 68, 0.55)') +
        '; border-radius: 16px; padding: 12px; spacing: 6px;';
    const processTitle = new St.Label({text: 'Top processes'});
    processTitle.style = 'font-size: 12px; font-weight: 650;';
    const processRows = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'spacing: 4px;',
    });
    const processNote = new St.Label({text: 'Read-only process summary'});
    processNote.style = 'font-size: 10px; opacity: 0.72;';
    processCard.add_child(processTitle);
    processCard.add_child(processRows);
    processCard.add_child(processNote);
    root.add_child(processCard);

    const gpuCard = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-control-center-card',
        x_expand: true,
    });
    gpuCard.style = 'background-color: ' + getThemeColor('qsSurface', 'rgba(49, 50, 68, 0.55)') +
        '; border-radius: 16px; padding: 12px; spacing: 6px;';
    const gpuTitle = new St.Label({text: 'GPU monitoring'});
    gpuTitle.style = 'font-size: 12px; font-weight: 650;';
    const gpuToggle = new St.Button({
        reactive: true,
        can_focus: true,
        child: new St.Label({text: 'Enable GPU metrics'}),
    });
    gpuToggle.style = 'padding: 7px 10px; border-radius: 10px;';
    gpuToggle.accessible_name = 'Enable GPU metrics';
    gpuToggle.set_tooltip_text('GPU queries stay off until you explicitly enable them');
    const gpuValue = new St.Label({text: 'Off — GPU is not queried'});
    gpuCard.add_child(gpuTitle);
    gpuCard.add_child(gpuToggle);
    gpuCard.add_child(gpuValue);
    root.add_child(gpuCard);

    let destroyed = false;
    let cpuPrevious = null;
    let temperaturePath = undefined;
    let tick = 0;
    let processInFlight = false;
    let processCancellable = null;
    let gpuEnabled = false;
    let gpuGeneration = 0;
    let gpuInFlight = false;
    let gpuCancellable = null;
    let latestProcesses = [];

    const renderProcesses = message => {
        for (const child of [...processRows.get_children()]) {
            processRows.remove_child(child);
            child.destroy();
        }
        if (message) {
            processRows.add_child(new St.Label({text: message}));
            return;
        }
        const rows = filterAndSortProcesses(latestProcesses, '', 'cpu', 5);
        if (rows.length === 0) {
            processRows.add_child(new St.Label({text: 'No process data available'}));
            return;
        }
        for (const process of rows) {
            const row = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                x_expand: true,
            });
            const name = new St.Label({text: process.comm, x_expand: true});
            name.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            const stats = new St.Label({text: process.pcpu + '% CPU · ' + process.pmem + '% RAM'});
            row.add_child(name);
            row.add_child(stats);
            processRows.add_child(row);
        }
    };

    const refreshProcesses = () => {
        if (destroyed || processInFlight)
            return;
        processInFlight = true;
        processCancellable = new Gio.Cancellable();
        try {
            const proc = Gio.Subprocess.new(
                ['env', 'LC_ALL=C', 'ps', '-eo', 'pid,pcpu,pmem,comm', '--no-headers'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            proc.communicate_utf8_async(null, processCancellable, (source, result) => {
                if (destroyed)
                    return;
                try {
                    const [, stdout, stderr] = source.communicate_utf8_finish(result);
                    if (!source.get_successful())
                        throw new Error(stderr || 'ps command failed');
                    latestProcesses = parseProcessSnapshot(stdout || '');
                    renderProcesses('');
                } catch (error) {
                    if (!processCancellable?.is_cancelled?.())
                        renderProcesses('Process list unavailable');
                } finally {
                    processInFlight = false;
                    processCancellable = null;
                }
            });
        } catch (error) {
            processInFlight = false;
            processCancellable = null;
            renderProcesses('Process list unavailable');
        }
    };

    const refreshGpu = () => {
        if (destroyed || !gpuEnabled || gpuInFlight)
            return;
        gpuInFlight = true;
        const generation = ++gpuGeneration;
        gpuCancellable = new Gio.Cancellable();
        readGpuInfoAsync(gpuCancellable, result => {
            if (destroyed)
                return;
            gpuInFlight = false;
            gpuCancellable = null;
            if (generation !== gpuGeneration) {
                if (gpuEnabled)
                    refreshGpu();
                return;
            }
            if (!gpuEnabled)
                return;
            gpuValue.text = result
                ? (result.name || result.vendor || 'GPU') + ' · ' +
                    (result.util == null ? 'Usage —' : result.util + '%') +
                    (result.temp == null ? '' : ' · ' + result.temp + '°C')
                : 'GPU metrics unavailable on this hardware/driver';
        });
    };

    gpuToggle.connect('clicked', () => {
        gpuEnabled = !gpuEnabled;
        gpuToggle.child.text = gpuEnabled ? 'Disable GPU metrics' : 'Enable GPU metrics';
        if (gpuEnabled) {
            gpuValue.text = 'Checking GPU hardware…';
            refreshGpu();
        } else {
            gpuGeneration++;
            try { gpuCancellable?.cancel(); } catch (e) {}
            gpuValue.text = 'Off — GPU is not queried';
        }
    });

    const refresh = () => {
        if (destroyed)
            return GLib.SOURCE_REMOVE;
        const cpuSample = readCpuUsage(cpuPrevious);
        cpuPrevious = cpuSample.previous;
        cpu.update(cpuSample.value, cpuSample.value === null ? 'Sampling…' : cpuSample.value + '%',
            cpuSample.value === null ? 'CPU utilization is being sampled' : 'CPU utilization ' + cpuSample.value + ' percent');

        const mem = readMemInfo();
        if (mem) {
            memory.update(mem.usedPct, mem.usedPct + '%',
                'Memory used ' + mem.usedPct + ' percent; ' +
                Math.round(mem.usedKb / 1024) + ' of ' + Math.round(mem.totalKb / 1024) + ' megabytes');
        } else {
            memory.update(null, 'Unavailable', 'Memory information unavailable');
        }

        if (temperaturePath === undefined)
            temperaturePath = findTemperaturePath();
        const temp = readTemperature(temperaturePath);
        temperature.update(temp === null ? null : temp / 110 * 100,
            temp === null ? 'Unavailable' : temp + '°C',
            temp === null ? 'CPU temperature sensor unavailable' : 'CPU temperature ' + temp + ' degrees Celsius');

        setControlCenterMetrics({
            cpu: cpuSample.value, memory: mem?.usedPct ?? null, temperature: temp,
            sampledAt: GLib.get_monotonic_time(),
        });

        const network = getNetworkMetrics();
        const freshNetwork = network && GLib.get_monotonic_time() - network.updatedAt < 5000000;
        download.text = freshNetwork ? '↓ Download  ' + formatNetworkRate(network.down) : '↓ Download  Unavailable';
        upload.text = freshNetwork ? '↑ Upload  ' + formatNetworkRate(network.up) : '↑ Upload  Unavailable';
        networkNote.text = freshNetwork
            ? 'Using the shared Network Speed sampler'
            : 'Enable the Network Speed module to provide live samples';

        tick++;
        if (tick % PROCESS_REFRESH_TICKS === 1)
            refreshProcesses();
        if (gpuEnabled)
            refreshGpu();
        return GLib.SOURCE_CONTINUE;
    };

    renderProcesses('Loading processes…');
    refresh();
    const timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, refresh);
    root.connect('destroy', () => {
        destroyed = true;
        try { GLib.source_remove(timerId); } catch (e) {}
        try { processCancellable?.cancel(); } catch (e) {}
        try { gpuCancellable?.cancel(); } catch (e) {}
    });
    return root;
}
