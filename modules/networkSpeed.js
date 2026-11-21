import {setChipA11y} from '../lib/a11y.js';
import {wireChipPress} from '../lib/pressFx.js';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose, isSessionLocked} from '../lib/shellCompat.js';
import {startNetSpeedMonitor} from '../lib/netSpeedMonitor.js';
import {isNetworkSpeedAutoHideEnabled} from '../lib/networkSpeedVisibilityState.js';
import {getNetworkSpeedUnit} from '../lib/networkSpeedUnit.js';
import {setNetworkMetrics, clearNetworkMetrics} from '../lib/systemMetricsState.js';
import {createPopupHeader} from '../lib/popupHeader.js';
import {createSparkline} from '../lib/sparkline.js';
import {
    rateHistoryToPercent,
    parseSsProcessBandwidth,
    diffProcessBandwidth,
} from '../lib/networkDesign.js';
import {getProcessBandwidthSnapshot} from '../lib/networkDiagnostics.js';

function formatNetworkRate(bytesPerSec, unit = 'bytes') {
    const value = Math.max(0, Number(bytesPerSec) || 0);
    if (unit === 'bits') {
        const bits = value * 8;
        if (bits < 1000) return `${Math.round(bits)} bit/s`;
        if (bits < 1_000_000) return `${(bits / 1000).toFixed(1)} kbit/s`;
        if (bits < 1_000_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbit/s`;
        return `${(bits / 1_000_000_000).toFixed(2)} Gbit/s`;
    }
    if (value < 1024) return `${Math.round(value)} B/s`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB/s`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB/s`;
}

const HISTORY_LEN = 28;

export function buildNetworkSpeed(_extensionPath, scale = 1.0) {
    let last = {down: 0, up: 0, downText: '—', upText: '—', iface: null};
    const downHistory = [];
    const upHistory = [];
    let sessionRx = 0, sessionTx = 0;
    let sessionIface = null;

    // Stacked ↑/↓ readout in the bar (network-throughput plugin style).
    const icon = new St.Icon({
        style_class: 'material-panel-network-speed-icon',
        icon_name: 'network-transmit-receive-symbolic',
        icon_size: Math.round(14 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
    });
    const chipUp = new St.Label({
        text: '↑ —',
        style_class: 'material-panel-net-speed-chip-up',
    });
    const chipDown = new St.Label({
        text: '↓ —',
        style_class: 'material-panel-net-speed-chip-down',
    });
    const chipRates = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-net-speed-chip-rates',
        style: 'spacing: 1px;',
    });
    chipRates.add_child(chipUp);
    chipRates.add_child(chipDown);
    const chipBox = new St.BoxLayout({
        style_class: 'material-panel-net-speed-chip-box',
        style: 'spacing: 5px;',
        y_align: Clutter.ActorAlign.CENTER,
    });
    chipBox.add_child(icon);
    chipBox.add_child(chipRates);

    const button = new St.Button({
        style_class: 'material-panel-network-speed material-panel-chip material-panel-network-speed-btn',
        reactive: true,
        track_hover: true,
        child: chipBox,
    });
    const autoHideWhenIdle = isNetworkSpeedAutoHideEnabled();
    let idleSince = null;
    const IDLE_HIDE_AFTER_US = 30 * 1000 * 1000;

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-net-speed-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const ui = (text, style) => new St.Label({text: String(text ?? ''), style});
    const eyebrow = t => ui(t, 'font-family: "Noto Sans", sans-serif; font-size: 9px; font-weight: 700; opacity: 0.55; letter-spacing: 1px;');

    const body = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-net-speed-popup-body',
        x_expand: true,
        style: 'spacing: 10px; padding: 14px; width: 340px;',
    });
    body.style = 'background-color: transparent; spacing: 10px; padding: 14px; width: 340px;';

    // Header
    const headerRow = new St.BoxLayout({x_expand: true, style: 'spacing: 8px;'});
    headerRow.add_child(ui('NETWORK SPEED', 'font-family: "Noto Sans", sans-serif; font-size: 11px; font-weight: 700; opacity: 0.8;'));
    const ifaceL = ui('—', 'font-family: "Noto Sans", sans-serif; font-size: 9px; opacity: 0.5;');
    ifaceL.x_expand = true;
    ifaceL.x_align = Clutter.ActorAlign.END;
    headerRow.add_child(ifaceL);
    body.add_child(headerRow);

    // Two big stat cards
    const statCard = (title, colorClass) => {
        const card = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'material-panel-net-stat-card ' + colorClass,
            x_expand: true,
            style: 'spacing: 4px; padding: 12px; border-radius: 12px;',
        });
        card.add_child(eyebrow(title));
        const value = ui('—', 'font-family: "Noto Sans", sans-serif; font-size: 20px; font-weight: 700;');
        card.add_child(value);
        return {card, value};
    };
    const downStat = statCard('DOWNLOAD', 'down');
    const upStat = statCard('UPLOAD', 'up');
    const downSpark = createSparkline({count: HISTORY_LEN, height: 20, barWidth: 3});
    const upSpark = createSparkline({count: HISTORY_LEN, height: 20, barWidth: 3});
    downStat.card.add_child(downSpark.actor);
    upStat.card.add_child(upSpark.actor);
    const statRow = new St.BoxLayout({x_expand: true, style: 'spacing: 8px;'});
    statRow.add_child(downStat.card);
    statRow.add_child(upStat.card);
    body.add_child(statRow);

    // Session card
    const sessionCard = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-net-stat-card',
        x_expand: true,
        style: 'spacing: 6px; padding: 10px 12px; border-radius: 12px;',
    });
    sessionCard.add_child(eyebrow('SESSION'));
    const sessL = ui('', 'font-family: "Noto Sans", sans-serif; font-size: 12px; font-weight: 600;');
    sessionCard.add_child(sessL);
    body.add_child(sessionCard);

    // Processes card
    const procCard = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-net-stat-card',
        x_expand: true,
        style: 'spacing: 6px; padding: 10px 12px; border-radius: 12px;',
    });
    procCard.add_child(eyebrow('TOP PROCESSES'));
    const procBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-net-speed-procs',
        x_expand: true,
        style: 'spacing: 4px;',
    });
    procCard.add_child(procBox);
    body.add_child(procCard);

    let procSnapshot = null;
    let procSnapshotAt = 0;
    let procInFlight = false;
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    const refreshPopup = () => {
        ifaceL.text = last.iface || '—';
        downStat.value.text = last.downText;
        upStat.value.text = last.upText;
        const fmtTot = n => {
            n = Math.max(0, Number(n) || 0);
            if (n < 1024) return `${Math.round(n)} B`;
            if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
            if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
            return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };
        sessL.text = `↓ ${fmtTot(sessionRx)}     ↑ ${fmtTot(sessionTx)}`;
        upSpark.update(rateHistoryToPercent(upHistory));
        downSpark.update(rateHistoryToPercent(downHistory));
        renderProcessRows();
    };

    const renderProcessRows = () => {
        procBox.destroy_all_children();
        if (!procSnapshot) {
            procBox.add_child(ui('Measuring…', 'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.6;'));
            return;
        }
        const now = GLib.get_monotonic_time() / 1000000;
        const rows = procSecondSnapshot
            ? diffProcessBandwidth(procSnapshot, procSecondSnapshot, Math.max(0.2, now - procSecondAt))
            : [];
        if (rows.length === 0) {
            procBox.add_child(ui('No active TCP traffic', 'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.6;'));
            return;
        }
        for (const row of rows) {
            const line = ui(
                `${row.name}     ↓ ${formatNetworkRate(row.down, getNetworkSpeedUnit())}     ↑ ${formatNetworkRate(row.up, getNetworkSpeedUnit())}`,
                'font-family: "Noto Sans", sans-serif; font-size: 10px;');
            line.clutter_text.ellipsize = 1;
            procBox.add_child(line);
        }
        // "Other traffic" = interface total minus attributed process rates.
        const attributedDown = rows.reduce((n, r) => n + r.down, 0);
        const attributedUp = rows.reduce((n, r) => n + r.up, 0);
        const otherDown = Math.max(0, last.down - attributedDown);
        const otherUp = Math.max(0, last.up - attributedUp);
        if (otherDown > 0 || otherUp > 0) {
            procBox.add_child(ui(
                `Other traffic     ↓ ${formatNetworkRate(otherDown, getNetworkSpeedUnit())}     ↑ ${formatNetworkRate(otherUp, getNetworkSpeedUnit())}`,
                'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.65;'));
        }
    };
    let procSecondSnapshot = null;
    let procSecondAt = 0;

    const sampleProcessBandwidth = async () => {
        if (procInFlight || !menu.isOpen)
            return;
        procInFlight = true;
        const text = await getProcessBandwidthSnapshot();
        const parsed = parseSsProcessBandwidth(text);
        const now = GLib.get_monotonic_time() / 1000000;
        if (!procSnapshot) {
            procSnapshot = parsed;
        } else {
            procSecondSnapshot = parsed;
            procSecondAt = now;
        }
        procSnapshotAt = now;
        procInFlight = false;
        if (menu.isOpen)
            renderProcessRows();
    };

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            refreshPopup();
            sampleProcessBandwidth();
            menuOpen(menu);
        }
    });
    const speedRefreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
        if (menu.isOpen)
            sampleProcessBandwidth();
        return GLib.SOURCE_CONTINUE;
    });

    const stopMonitor = startNetSpeedMonitor(sample => {
        if (sample.iface !== sessionIface) {
            sessionIface = sample.iface;
            sessionRx = 0;
            sessionTx = 0;
        } else {
            sessionRx += Math.max(0, Number(sample.rxDelta) || 0);
            sessionTx += Math.max(0, Number(sample.txDelta) || 0);
        }
        const down = Math.max(0, Number(sample.down) || 0);
        const up = Math.max(0, Number(sample.up) || 0);
        if (!autoHideWhenIdle || !sample.iface || down > 0 || up > 0) {
            idleSince = null;
            button.visible = true;
        } else {
            const now = GLib.get_monotonic_time();
            if (idleSince === null)
                idleSince = now;
            button.visible = now - idleSince < IDLE_HIDE_AFTER_US;
        }
        downHistory.push(down);
        upHistory.push(up);
        if (downHistory.length > HISTORY_LEN) downHistory.splice(0, downHistory.length - HISTORY_LEN);
        if (upHistory.length > HISTORY_LEN) upHistory.splice(0, upHistory.length - HISTORY_LEN);
        chipUp.text = `↑ ${formatNetworkRate(up, getNetworkSpeedUnit())}`;
        chipDown.text = `↓ ${formatNetworkRate(down, getNetworkSpeedUnit())}`;
        const unit = getNetworkSpeedUnit();
        last = {
            down: sample.down,
            up: sample.up,
            downText: formatNetworkRate(sample.down, unit),
            upText: formatNetworkRate(sample.up, unit),
            iface: sample.iface,
        };
        try {
            setNetworkMetrics({
                down: sample.down,
                up: sample.up,
                updatedAt: GLib.get_monotonic_time(),
            });
        } catch (e) {}
        try {
            button.set_tooltip_text(sample.iface
                ? `${sample.iface}\n↓ ${last.downText}\n↑ ${last.upText}`
                : 'Network speed unavailable');
        } catch (e) {}
        if (menu.isOpen)
            refreshPopup();
    }, 1, () => {
        // Avoid /proc route and interface reads while the chip and popup are hidden.
        if (isSessionLocked() || (!autoHideWhenIdle && !button.mapped && !menu.isOpen))
            return true;
        try { return Boolean(Main.layoutManager.primaryMonitor?.inFullscreen); }
        catch (e) { return false; }
    });

    button.connect('destroy', () => {
        if (speedRefreshId)
            GLib.source_remove(speedRefreshId);
        try { stopMonitor(); } catch (e) {}
        clearNetworkMetrics();
        menu.destroy();
    });

    try { wireChipPress(button, {stickyUntilLeave: true}); } catch (e) {}
    try { setChipA11y(button, 'Network speed'); } catch (e) {}
    return button;
}
