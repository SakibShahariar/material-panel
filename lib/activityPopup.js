import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {createSparkline} from './sparkline.js';
import {attachPopupDismiss} from './popupDismiss.js';
import {getThemeColor} from './themeColorState.js';

function label(text, styleClass, extra = {}) {
    return new St.Label({text: String(text ?? ''), style_class: styleClass, ...extra});
}

/**
 * Activity dashboard. The visual surface is custom-built, but it lives inside
 * the standard PopupMenu frame so outside clicks, Escape, focus handling and
 * teardown are managed by the same PopupMenuManager as every other popup.
 */
export function createActivityPopup({button, getData, getProcesses, refreshProcesses, openMonitor}) {
    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-activity-frame');
    try {
        const mon = Main.layoutManager.primaryMonitor;
        const w = Math.min(440, Math.max(300, (mon?.width ?? 900) - 32));
        const h = Math.floor((mon?.height ?? 800) * 0.78);
        menu.box.style = `width: ${w}px; min-width: ${w}px; max-width: ${w}px; max-height: ${h}px;`;
        try { menu.box.clip_to_allocation = true; } catch (e) {}
    } catch (e) {}

    const root = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-activity-popup',
        x_expand: true,
        style: 'spacing: 10px;',
    });
    // Paint the surface from the live theme state rather than relying on the
    // stylesheet cascade: the bundled fallback lags behind matugen updates.
    let appliedSurface = null;
    let popupOpacity = 0.92;
    const setOpacity = value => {
        const n = Number(value);
        if (!Number.isFinite(n))
            return;
        const next = Math.max(0.5, Math.min(1, n));
        if (next === popupOpacity)
            return;
        popupOpacity = next;
        appliedSurface = null;
        applySurface();
    };
    const hexToRgba = (hex, alpha) => {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!m)
            return null;
        const n = parseInt(m[1], 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    };
    const applySurface = () => {
        const surface = getThemeColor('surface', '#1a1110');
        const key = `${surface}|${popupOpacity}`;
        if (key === appliedSurface)
            return;
        appliedSurface = key;
        const shaded = hexToRgba(surface, popupOpacity) ?? surface;
        try { root.style = `background-color: ${shaded};`; } catch (e) {}
        const primary = getThemeColor('primary', '#ffba42');
        try { heroBarFill.style = `background-color: ${primary};`; } catch (e) {}
        for (const tile of coreTiles)
            try { tile.fill.style = `background-color: ${primary};`; } catch (e) {}
        cpuSpark.applyColor();
        tempSpark.applyColor();
        memSpark.applyColor();
    };

    // ---- tabs -----------------------------------------------------------
    let active = 'overview';
    const tabButtons = [];
    const tabStrip = new St.BoxLayout({
        style_class: 'material-panel-activity-tabs',
        style: 'spacing: 6px;',
    });
    const makeTab = (id, text) => {
        const b = new St.Button({label: text, style_class: 'material-panel-activity-tab'});
        b.connect('clicked', () => setPage(id));
        tabStrip.add_child(b);
        tabButtons.push({id, actor: b});
    };
    makeTab('overview', 'Overview');
    makeTab('processes', 'Processes');
    root.add_child(tabStrip);

    // ---- overview -------------------------------------------------------
    const overview = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-activity-page',
        x_expand: true,
        style: 'spacing: 10px;',
    });
    root.add_child(overview);

    const hero = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        style_class: 'material-panel-activity-hero',
        x_expand: true,
        style: 'spacing: 14px;',
    });
    const heroValue = label('—', 'material-panel-activity-hero-value');
    const heroMeta = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        style: 'spacing: 3px;',
    });
    heroMeta.add_child(label('CPU USAGE', 'material-panel-activity-eyebrow'));
    heroMeta.add_child(heroValue);
    const heroBarBg = new St.Widget({
        style_class: 'material-panel-activity-hero-bar',
        x_expand: true,
        height: 5,
        y_align: Clutter.ActorAlign.END,
    });
    const heroBarFill = new St.Widget({
        style_class: 'material-panel-activity-hero-fill',
        height: 5,
    });
    heroBarBg.add_child(heroBarFill);
    const tempBadge = label('—°', 'material-panel-activity-temp-badge');
    hero.add_child(heroMeta);
    hero.add_child(tempBadge);
    overview.add_child(hero);
    overview.add_child(heroBarBg);

    const statRow = new St.BoxLayout({
        style_class: 'material-panel-activity-stats',
        x_expand: true,
        style: 'spacing: 8px;',
    });
    const makeStat = (title, spark) => {
        const card = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'material-panel-activity-stat',
            x_expand: true,
            style: 'spacing: 4px;',
        });
        const value = label('—', 'material-panel-activity-stat-value');
        card.add_child(label(title, 'material-panel-activity-eyebrow'));
        card.add_child(value);
        card.add_child(spark.actor);
        statRow.add_child(card);
        return value;
    };
    const cpuSpark = createSparkline();
    const tempSpark = createSparkline();
    const memSpark = createSparkline();
    const statCpu = makeStat('CPU', cpuSpark);
    const statTemp = makeStat('TEMP', tempSpark);
    const statMem = makeStat('MEMORY', memSpark);
    overview.add_child(statRow);

    const coresCard = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-activity-card',
        x_expand: true,
        style: 'spacing: 6px;',
    });
    coresCard.add_child(label('CORES', 'material-panel-activity-card-title'));
    const coreGrid = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        style: 'spacing: 6px;',
    });
    coresCard.add_child(coreGrid);
    overview.add_child(coresCard);

    const memCard = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-activity-card',
        x_expand: true,
        style: 'spacing: 4px;',
    });
    memCard.add_child(label('MEMORY', 'material-panel-activity-card-title'));
    const memRows = {};
    for (const key of ['used', 'available', 'cache', 'swap']) {
        const row = new St.BoxLayout({x_expand: true, style: 'spacing: 8px;'});
        row.add_child(label(key.toUpperCase(), 'material-panel-activity-mem-key', {x_expand: true}));
        memRows[key] = label('—', 'material-panel-activity-mem-value');
        row.add_child(memRows[key]);
        memCard.add_child(row);
    }
    overview.add_child(memCard);

    // ---- processes ------------------------------------------------------
    const processes = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-activity-page',
        x_expand: true,
        style: 'spacing: 8px;',
    });
    root.add_child(processes);
    processes.visible = false;

    const search = new St.Entry({
        hint_text: 'Filter processes…',
        can_focus: true,
        x_expand: true,
        style_class: 'material-panel-activity-search',
    });
    let filter = '';
    let searchId = 0;
    try {
        search.clutter_text.connect('text-changed', () => {
            filter = String(search.get_text() || '').trim().toLowerCase();
            if (searchId)
                GLib.source_remove(searchId);
            searchId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                searchId = 0;
                renderProcesses();
                return GLib.SOURCE_REMOVE;
            });
        });
    } catch (e) {}
    processes.add_child(search);

    let sort = 'cpu';
    let selected = 0;
    const tableHead = new St.BoxLayout({
        style_class: 'material-panel-activity-proc-header',
        x_expand: true,
        style: 'spacing: 8px;',
    });
    tableHead.add_child(label('Process', 'material-panel-activity-proc-col', {x_expand: true}));
    tableHead.add_child(label('PID', 'material-panel-activity-proc-col', {width: 52}));
    const cpuSort = new St.Button({label: 'CPU%', style_class: 'material-panel-activity-sort', width: 48});
    const memSort = new St.Button({label: 'MEM%', style_class: 'material-panel-activity-sort', width: 48});
    cpuSort.connect('clicked', () => { sort = 'cpu'; renderProcesses(); });
    memSort.connect('clicked', () => { sort = 'mem'; renderProcesses(); });
    tableHead.add_child(cpuSort);
    tableHead.add_child(memSort);
    processes.add_child(tableHead);

    const procBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'spacing: 2px;',
        x_expand: true,
    });
    const scroll = new St.ScrollView({
        style_class: 'material-panel-activity-scroll',
        overlay_scrollbars: true,
        x_expand: true,
    });
    try {
        scroll.hscrollbar_policy = St.PolicyType.NEVER;
        scroll.vscrollbar_policy = St.PolicyType.AUTOMATIC;
        scroll.set_child(procBox);
    } catch (e) {}
    processes.add_child(scroll);

    const monitorBtn = new St.Button({
        label: 'Open System Monitor',
        style_class: 'material-panel-activity-action',
        x_expand: true,
    });
    monitorBtn.connect('clicked', () => { openMonitor?.(); close(); });
    processes.add_child(monitorBtn);

    let currentRows = [];
    const renderProcesses = () => {
        procBox.destroy_all_children();
        const data = getProcesses?.() ?? {};
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const term = filter;
        const visible = rows.filter(p =>
            !term || String(p.comm ?? '').toLowerCase().includes(term) || String(p.pid ?? '').includes(term));
        visible.sort((a, b) => (sort === 'cpu' ? (b.pcpu ?? 0) - (a.pcpu ?? 0) : (b.pmem ?? 0) - (a.pmem ?? 0)));
        currentRows = visible.slice(0, 10);
        selected = Math.max(0, Math.min(selected, currentRows.length - 1));
        if (data.loading && currentRows.length === 0) {
            procBox.add_child(label('Loading processes…', 'material-panel-activity-empty'));
            return;
        }
        if (data.error && currentRows.length === 0) {
            procBox.add_child(label('Process list unavailable', 'material-panel-activity-empty'));
            return;
        }
        if (currentRows.length === 0) {
            procBox.add_child(label('No matching processes', 'material-panel-activity-empty'));
            return;
        }
        for (const [i, p] of currentRows.entries()) {
            const row = new St.BoxLayout({
                style_class: 'material-panel-activity-proc-row' + (i === selected ? ' selected' : ''),
                x_expand: true,
                style: 'spacing: 8px; padding: 6px 8px;',
            });
            row.add_child(label(String(p.comm ?? '').slice(0, 20), 'material-panel-activity-proc-name', {x_expand: true}));
            row.add_child(label(p.pid ?? '—', 'material-panel-activity-proc-num', {width: 52}));
            row.add_child(label(p.pcpu != null ? `${p.pcpu}%` : '—', 'material-panel-activity-proc-num', {width: 48}));
            row.add_child(label(p.pmem != null ? `${p.pmem}%` : '—', 'material-panel-activity-proc-num', {width: 48}));
            procBox.add_child(row);
        }
    };

    const coreTiles = [];
    let lastGroup = null;
    let tileRow = null;
    const ensureTiles = (cores, classes) => {
        while (coreTiles.length < cores.length) {
            const i = coreTiles.length;
            const tag = classes?.[i] ?? '';
            if ((tag === 'P' || tag === 'E') && tag !== lastGroup) {
                coreGrid.add_child(label(
                    tag === 'P' ? 'PERFORMANCE' : 'EFFICIENCY',
                    'material-panel-activity-core-group'));
                lastGroup = tag;
                tileRow = null;
            }
            if (!tileRow || tileRow.get_children().length >= 3) {
                tileRow = new St.BoxLayout({
                    orientation: Clutter.Orientation.HORIZONTAL,
                    x_expand: true,
                    style: 'spacing: 6px; padding: 2px 0;',
                });
                coreGrid.add_child(tileRow);
            }
            const tile = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
                style_class: 'material-panel-activity-core-tile' + (tag === 'P' ? ' p' : ''),
                style: 'spacing: 4px;',
            });
            tile.add_child(label(tag ? `${i} ${tag}` : `${i}`, 'material-panel-activity-core-name'));
            const bg = new St.Widget({
                style_class: 'material-panel-activity-core-bar',
                x_expand: true,
                height: 5,
            });
            const fill = new St.Widget({style_class: 'material-panel-activity-core-fill', height: 5});
            bg.add_child(fill);
            const value = label('—', 'material-panel-activity-core-value');
            tile.add_child(bg);
            tile.add_child(value);
            tileRow.add_child(tile);
            coreTiles.push({fill, value, bg});
        }
        coreGrid.visible = cores.length > 0;
        coresCard.visible = cores.length > 0;
    };

    function setPage(id) {
        active = id;
        overview.visible = id === 'overview';
        processes.visible = id === 'processes';
        for (const {id: tid, actor} of tabButtons) {
            if (tid === id)
                actor.add_style_class_name('active');
            else
                actor.remove_style_class_name('active');
        }
        if (id === 'processes') {
            renderProcesses();
            refreshProcesses?.();
        }
    }
    setPage('overview');
    applySurface();

    let refreshId = 0;

    // Put the custom surface inside real PopupMenu sections so the standard
    // PopupMenuManager handles outside clicks, Escape, focus and teardown.
    const tabSection = new PopupMenu.PopupMenuSection();
    tabSection.actor.add_child(tabStrip);
    menu.addMenuItem(tabSection);
    const contentSection = new PopupMenu.PopupMenuSection();
    contentSection.actor.add_child(root);
    menu.addMenuItem(contentSection);
    const disposeDismiss = attachPopupDismiss(menu, button);

    function update() {
        applySurface();
        const data = getData?.() ?? {};
        const history = data.history ?? {cpu: [], temp: [], mem: []};
        const pct = data.totalPct;
        heroValue.text = pct != null ? `${pct}%` : '—';
        statCpu.text = pct != null ? `${pct}%` : '—';
        statTemp.text = data.temp != null ? `${data.temp}°` : '—';
        tempBadge.text = data.temp != null ? `${data.temp}°C` : '—';
        statMem.text = data.mem?.usedPct != null ? `${data.mem.usedPct}%` : '—';
        try { heroBarFill.width = Math.round(((pct ?? 0) / 100) * (heroBarBg.width || 360)); } catch (e) {}
        try {
            tempBadge.remove_style_class_name('warn');
            tempBadge.remove_style_class_name('critical');
            if (data.temp != null && data.temp >= 90)
                tempBadge.add_style_class_name('critical');
            else if (data.temp != null && data.temp >= 85)
                tempBadge.add_style_class_name('warn');
        } catch (e) {}
        cpuSpark.update(history.cpu);
        tempSpark.update(history.temp);
        memSpark.update(history.mem);

        const cores = Array.isArray(data.cores) ? data.cores : [];
        ensureTiles(cores, data.coreClasses);
        for (let i = 0; i < coreTiles.length; i++) {
            const c = cores[i];
            const v = c && typeof c === 'object' ? c.pct : c;
            const tile = coreTiles[i];
            tile.value.text = v != null ? `${v}%` : '—';
            try { tile.fill.width = Math.round(((v ?? 0) / 100) * (tile.bg.width || 120)); } catch (e) {}
        }
        const mem = data.mem ?? {};
        memRows.used.text = mem.usedPct != null ? `${mem.used}% (${mem.usedPct}%)` : '—';
        memRows.available.text = mem.available ?? '—';
        memRows.cache.text = mem.cache ?? '—';
        memRows.swap.text = mem.swap ?? '—';
        if (active === 'processes')
            renderProcesses();
    }

    const stopRefresh = () => {
        if (refreshId) {
            GLib.source_remove(refreshId);
            refreshId = 0;
        }
    };
    const startRefresh = () => {
        if (refreshId)
            return;
        update();
        refreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (!menu.isOpen) {
                refreshId = 0;
                return GLib.SOURCE_REMOVE;
            }
            update();
            return GLib.SOURCE_CONTINUE;
        });
    };
    menu.connect('open-state-changed', (_m, open) => {
        if (open)
            startRefresh();
        else
            stopRefresh();
    });

    // Shortcuts beyond Escape (which PopupMenu already handles).
    menu.actor.connect('key-press-event', (_actor, event) => {
        let key;
        try { key = event.get_key_symbol(); } catch (e) { return Clutter.EVENT_PROPAGATE; }
        if (key === Clutter.KEY_1) { setPage('overview'); return Clutter.EVENT_STOP; }
        if (key === Clutter.KEY_2) { setPage('processes'); return Clutter.EVENT_STOP; }
        if (key === Clutter.KEY_e) { setPage(active === 'overview' ? 'processes' : 'overview'); return Clutter.EVENT_STOP; }
        if (key === Clutter.KEY_slash) {
            setPage('processes');
            try { search.grab_key_focus(); } catch (e) {}
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_j || key === Clutter.KEY_k) {
            setPage('processes');
            selected = Math.max(0, selected + (key === Clutter.KEY_j ? 1 : -1));
            renderProcesses();
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_r) {
            update();
            refreshProcesses?.();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    function open() {
        if (menu.isOpen)
            return;
        update();
        menu.open();
    }

    function close() {
        menu.close();
    }

    function destroy() {
        stopRefresh();
        if (searchId) {
            try { GLib.source_remove(searchId); } catch (e) {}
            searchId = 0;
        }
        try { disposeDismiss?.(); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    }

    return {
        get isOpen() { return !!menu.isOpen; },
        open,
        close,
        toggle: () => (menu.isOpen ? close() : open()),
        update,
        setOpacity,
        destroy,
    };
}
