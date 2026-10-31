import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuToggle, isSessionLocked} from '../lib/shellCompat.js';
import {giconForKey, wireChipPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';
import {parseNvidiaSmiOutput} from '../lib/gpuMetrics.js';

let cachedGpuBasePath = null;
let cachedGpuCard = null;
let cachedGpuName = 'GPU';
let cachedHwmonBasePath = null;
let cachedHwmonTempPath = null;
let lastHwmonDiscoveryAt = 0;
let lastGpuDiscoveryAt = 0;
const SENSOR_RETRY_INTERVAL_US = 30 * 1_000_000;

function readTemperatureAtPath(path) {
    try {
        const [ok, contents] = Gio.File.new_for_path(path).load_contents(null);
        if (!ok)
            return null;
        const value = Number.parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
        return Number.isFinite(value) ? Math.round(value / 1000) : null;
    } catch (e) {
        return null;
    }
}

function readGpuTemperature(base) {
    if (cachedHwmonBasePath !== base) {
        cachedHwmonBasePath = base;
        cachedHwmonTempPath = null;
        lastHwmonDiscoveryAt = 0;
    }
    if (cachedHwmonTempPath) {
        const temp = readTemperatureAtPath(cachedHwmonTempPath);
        if (temp !== null)
            return temp;
        // The sensor disappeared or became unreadable; rediscover immediately.
        cachedHwmonTempPath = null;
        lastHwmonDiscoveryAt = 0;
    }
    const now = GLib.get_monotonic_time();
    if (now - lastHwmonDiscoveryAt < SENSOR_RETRY_INTERVAL_US)
        return null;
    lastHwmonDiscoveryAt = now;
    try {
        const hwmon = Gio.File.new_for_path(base + '/hwmon');
        const hwmonEn = hwmon.enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = hwmonEn.next_file(null)) !== null) {
            const path = base + '/hwmon/' + info.get_name() + '/temp1_input';
            const temp = readTemperatureAtPath(path);
            if (temp !== null) {
                cachedHwmonTempPath = path;
                try { hwmonEn.close(null); } catch (e) {}
                return temp;
            }
        }
        try { hwmonEn.close(null); } catch (e) {}
    } catch (e) {}
    return null;
}

function readGpuCard(base, card, knownName = null) {
    let util = null, temp = null, memUsed = null, memTotal = null;
    let name = knownName || 'GPU';
    try {
        const [ok, contents] = Gio.File.new_for_path(base + '/gpu_busy_percent').load_contents(null);
        if (ok) {
            const value = Number.parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
            if (Number.isFinite(value))
                util = value;
        }
    } catch (e) {}
    try {
        const [ok, contents] = Gio.File.new_for_path(base + '/mem_info_vram_used').load_contents(null);
        if (ok) {
            const value = Number.parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
            if (Number.isFinite(value))
                memUsed = Math.round(value / (1024 * 1024));
        }
    } catch (e) {}
    try {
        const [ok, contents] = Gio.File.new_for_path(base + '/mem_info_vram_total').load_contents(null);
        if (ok) {
            const value = Number.parseInt(new TextDecoder('utf-8').decode(contents).trim(), 10);
            if (Number.isFinite(value))
                memTotal = Math.round(value / (1024 * 1024));
        }
    } catch (e) {}
    if (!knownName) {
        try {
            const [ok, contents] = Gio.File.new_for_path(base + '/vendor').load_contents(null);
            if (ok) {
                const vendor = new TextDecoder('utf-8').decode(contents).trim().toLowerCase();
                if (vendor.includes('0x1002') || vendor.includes('amd')) name = 'AMD';
                else if (vendor.includes('0x8086') || vendor.includes('intel')) name = 'Intel';
                else if (vendor.includes('0x10de') || vendor.includes('nvidia')) name = 'NVIDIA';
            }
        } catch (e) {}
    }
    temp = readGpuTemperature(base);
    if (util == null && temp == null && memUsed == null)
        return null;
    cachedGpuBasePath = base;
    cachedGpuCard = card;
    cachedGpuName = name;
    return {vendor: name, name: name + ' (' + card + ')', util, memUsed, memTotal, temp};
}

function readGpuInfoFallback() {
    if (cachedGpuBasePath) {
        const cached = readGpuCard(cachedGpuBasePath, cachedGpuCard, cachedGpuName);
        if (cached)
            return cached;
        // Cached device disappeared or no longer exposes any usable metrics.
        cachedGpuBasePath = null;
        cachedGpuCard = null;
        cachedGpuName = 'GPU';
        cachedHwmonBasePath = null;
        cachedHwmonTempPath = null;
        lastHwmonDiscoveryAt = 0;
        lastGpuDiscoveryAt = 0;
    }
    const now = GLib.get_monotonic_time();
    if (now - lastGpuDiscoveryAt < SENSOR_RETRY_INTERVAL_US)
        return null;
    lastGpuDiscoveryAt = now;
    // Enumerate DRM cards only on first discovery, after a cached device fails,
    // or after the short negative-cache interval on unsupported systems.
    try {
        const drmDir = Gio.File.new_for_path('/sys/class/drm');
        const en = drmDir.enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
        const cards = [];
        let info;
        while ((info = en.next_file(null)) !== null) {
            const name = info.get_name();
            if (/^card\d+$/.test(name))
                cards.push(name);
        }
        try { en.close(null); } catch (e) {}
        cards.sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
        for (const card of cards) {
            const result = readGpuCard('/sys/class/drm/' + card + '/device', card);
            if (result)
                return result;
        }
    } catch (e) {}
    return null;
}

function readGpuInfoAsync(cancellable, callback) {
    let completed = false;
    const finish = result => {
        if (completed)
            return;
        completed = true;
        callback(result);
    };
    try {
        const proc = Gio.Subprocess.new(
            ['nvidia-smi', '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        proc.communicate_utf8_async(null, cancellable, (source, result) => {
            try {
                const [, stdout] = source.communicate_utf8_finish(result);
                if (cancellable.is_cancelled()) {
                    finish(null);
                    return;
                }
                finish(source.get_successful()
                    ? (parseNvidiaSmiOutput(stdout) || readGpuInfoFallback())
                    : readGpuInfoFallback());
            } catch (e) {
                finish(cancellable.is_cancelled() ? null : readGpuInfoFallback());
            }
        });
    } catch (e) {
        finish(cancellable.is_cancelled() ? null : readGpuInfoFallback());
    }
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
    try { setChipA11y(button, 'GPU'); } catch (e) {}
    try { wireChipPress(button, {getIcons: () => [{icon, key: 'gpu'}]}); } catch (e) {}

    // Keep the chip available so unsupported/unavailable metrics can be explained.
    button.visible = true;

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-gpu-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style: 'spacing: 6px; padding: 4px; min-width: 220px;'});
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

    let destroyed = false;
    let refreshInFlight = false;
    let refreshCancellable = null;
    let lastGpuInfo = null;

    const render = g => {
        if (destroyed)
            return;
        if (!g) {
            button.visible = true;
            label.text = '—';
            nameL.text = 'GPU metrics unavailable';
            utilL.text = 'Check supported hardware and GPU driver/tools';
            memL.text = '';
            tempL.text = '';
            try {
                button.set_tooltip_text(
                    'GPU metrics unavailable — hardware may be unsupported or its driver/tool may be missing');
            } catch (e) {}
            return GLib.SOURCE_CONTINUE;
        }
        button.visible = true;
        const util = g.util != null && Number.isFinite(g.util) ? g.util : null;
        const temp = g.temp != null && Number.isFinite(g.temp) ? g.temp : null;
        const memUsed = g.memUsed != null && Number.isFinite(g.memUsed) ? g.memUsed : null;
        const memTotal = g.memTotal != null && Number.isFinite(g.memTotal) ? g.memTotal : null;
        label.text = util != null ? `${util}%` : (temp != null ? `${temp}°C` : g.vendor);
        try {
            if (util != null && util >= 90)
                button.add_style_class_name('material-panel-chip-warn');
            else
                button.remove_style_class_name('material-panel-chip-warn');
        } catch (e) {}
        nameL.text = g.name || g.vendor || 'GPU';
        utilL.text = util != null ? `Usage  ${util}%` : 'Usage  —';
        memL.text = (memUsed != null && memTotal != null)
            ? `VRAM  ${memUsed} / ${memTotal} MB`
            : 'VRAM  —';
        tempL.text = temp != null ? `Temp  ${temp}°C` : 'Temp  —';
    };

    const refresh = () => {
        if (destroyed || refreshInFlight)
            return GLib.SOURCE_CONTINUE;
        refreshInFlight = true;
        refreshCancellable = new Gio.Cancellable();
        readGpuInfoAsync(refreshCancellable, result => {
            if (destroyed)
                return;
            refreshInFlight = false;
            refreshCancellable = null;
            if (result)
                lastGpuInfo = result;
            render(lastGpuInfo);
        });
        return GLib.SOURCE_CONTINUE;
    };

    refresh();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
        // GPU polling can spawn nvidia-smi and read sysfs; skip it while the
        // chip is hidden and its popup is closed. Clicks still refresh at once.
        if (isSessionLocked() || (!button.mapped && !menu.isOpen))
            return GLib.SOURCE_CONTINUE;
        return refresh();
    });
    button.connect('clicked', () => {
        refresh();
        menuToggle(menu);
        return Clutter.EVENT_STOP;
    });
    button.connect('destroy', () => {
        destroyed = true;
        try { refreshCancellable?.cancel(); } catch (e) {}
        try { GLib.source_remove(id); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });
    return button;
}
