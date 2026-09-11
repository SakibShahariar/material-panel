/**
 * end-4 workspaces: overlapping app icons + focus ring + empty dots.
 * Multi-app clusters use fixed width so negative margins never break allocation.
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import {wirePressedClass} from '../lib/pressFx.js';

const MAX_ICONS = 5;

function _allMetaWindows() {
    const out = [];
    try {
        for (const a of global.get_window_actors?.() || []) {
            try {
                const w = a.meta_window;
                if (w)
                    out.push(w);
            } catch (e) {}
        }
    } catch (e) {}
    return out;
}

function _windowsOnWorkspace(ws, index) {
    const wins = [];
    try {
        for (const w of ws.list_windows?.() || [])
            wins.push(w);
    } catch (e) {}
    if (wins.length === 0) {
        for (const w of _allMetaWindows()) {
            try {
                if (w.get_workspace?.()?.index() === index)
                    wins.push(w);
            } catch (e) {}
        }
    }
    return wins.filter(w => {
        try {
            if (w.minimized)
                return false;
        } catch (e) {}
        try {
            if (w.skip_taskbar || (typeof w.is_skip_taskbar === 'function' && w.is_skip_taskbar()))
                return false;
        } catch (e) {}
        try {
            const t = w.get_window_type?.();
            if (t === Meta.WindowType.DESKTOP || t === Meta.WindowType.DOCK ||
                t === Meta.WindowType.N_A)
                return false;
        } catch (e) {}
        return true;
    });
}

function _appsOnWorkspace(ws, index) {
    const tracker = Shell.WindowTracker.get_default();
    const seen = new Set();
    const apps = [];
    for (const win of _windowsOnWorkspace(ws, index)) {
        try {
            const app = tracker.get_window_app(win);
            if (!app)
                continue;
            const id = app.get_id?.() || app.get_name?.() || win.get_wm_class?.() || `w${apps.length}`;
            if (seen.has(id))
                continue;
            seen.add(id);
            let gicon = null;
            try { gicon = app.get_icon(); } catch (e) {}
            if (!gicon)
                continue;
            apps.push({app, gicon, id});
            if (apps.length >= MAX_ICONS)
                break;
        } catch (e) {}
    }
    return apps;
}

function _focusAppId() {
    try {
        const win = global.display.focus_window;
        if (!win)
            return null;
        const app = Shell.WindowTracker.get_default().get_window_app(win);
        return app?.get_id?.() || app?.get_name?.() || win.get_wm_class?.() || null;
    } catch (e) {
        return null;
    }
}

export function buildWorkspaces(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-workspaces material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        box.style = 'spacing: 8px; padding: 2px 8px; border-radius: 999px;';
    } catch (e) {}

    const manager = global.workspace_manager;
    const iconSize = Math.max(16, Math.round(20 * (scale || 1)));
    // Overlap amount — keep modest so layout stays valid
    const pull = Math.max(6, Math.round(iconSize * 0.38));
    const ringPad = 4; // border + padding around icon

    let rebuildTimer = 0;
    const scheduleRebuild = () => {
        if (rebuildTimer)
            return;
        rebuildTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            rebuildTimer = 0;
            try { rebuild(); } catch (e) {
                logError(e, 'material-panel: workspaces rebuild');
            }
            return GLib.SOURCE_REMOVE;
        });
    };

    const rebuild = () => {
        box.destroy_all_children();
        const end4 = globalThis._materialPanelLayoutStyle === 'end4';
        const activeIndex = manager.get_active_workspace_index();
        const n = manager.get_n_workspaces();
        const focusId = _focusAppId();

        if (!end4) {
            for (let i = 0; i < n; i++) {
                const active = i === activeIndex;
                const ws = manager.get_workspace_by_index(i);
                const btn = new St.Button({
                    style_class: active
                        ? 'material-panel-workspace-btn active'
                        : 'material-panel-workspace-btn',
                    label: `${i + 1}`,
                    reactive: true,
                    track_hover: true,
                    can_focus: true,
                });
                wirePressedClass(btn);
                btn.connect('clicked', () => ws.activate(global.get_current_time()));
                box.add_child(btn);
            }
            return;
        }

        for (let i = 0; i < n; i++) {
            const active = i === activeIndex;
            const ws = manager.get_workspace_by_index(i);
            const apps = _appsOnWorkspace(ws, i);

            if (apps.length === 0) {
                const dot = new St.Button({
                    style_class: active
                        ? 'material-panel-workspace-dot active'
                        : 'material-panel-workspace-dot',
                    reactive: true,
                    track_hover: true,
                    can_focus: true,
                });
                try {
                    const d = active ? 10 : 8;
                    dot.style =
                        `width: ${d}px; height: ${d}px; min-width: ${d}px; min-height: ${d}px;` +
                        'padding: 0; border-radius: 999px; border: none;';
                } catch (e) {}
                wirePressedClass(dot);
                dot.connect('clicked', () => ws.activate(global.get_current_time()));
                box.add_child(dot);
                continue;
            }

            const slot = iconSize + ringPad * 2;
            const count = apps.length;
            // Fixed width so St never collapses from negative margins
            const clusterW = slot + (count - 1) * (slot - pull) + 8;
            const clusterH = slot + 4;

            const cluster = new St.Widget({
                style_class: active
                    ? 'material-panel-ws-cluster active'
                    : 'material-panel-ws-cluster',
                reactive: false,
                width: clusterW,
                height: clusterH,
            });
            try {
                cluster.style =
                    `width: ${clusterW}px; height: ${clusterH}px; min-width: ${clusterW}px;` +
                    'border-radius: 999px;';
            } catch (e) {}

            apps.forEach((entry, idx) => {
                const isFocus = !!(
                    active && focusId &&
                    (entry.id === focusId ||
                        entry.app.get_id?.() === focusId ||
                        entry.app.get_name?.() === focusId)
                );
                const x = 4 + idx * (slot - pull);
                const ring = new St.Bin({
                    style_class: isFocus
                        ? 'material-panel-ws-app-ring active'
                        : 'material-panel-ws-app-ring',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    width: slot,
                    height: slot,
                });
                try {
                    ring.style = isFocus
                        ? `width: ${slot}px; height: ${slot}px; border-radius: 999px;` +
                          'border: 2px solid; padding: 2px;'
                        : `width: ${slot}px; height: ${slot}px; border-radius: 999px;` +
                          'border: 2px solid transparent; padding: 2px;';
                } catch (e) {}
                const img = new St.Icon({
                    style_class: 'material-panel-workspace-app',
                    gicon: entry.gicon,
                    icon_size: iconSize,
                });
                ring.set_child(img);
                cluster.add_child(ring);
                try {
                    ring.set_position(x, Math.round((clusterH - slot) / 2));
                } catch (e) {}
            });

            const btn = new St.Button({
                style_class: active
                    ? 'material-panel-workspace-btn cluster active'
                    : 'material-panel-workspace-btn cluster',
                reactive: true,
                track_hover: true,
                can_focus: true,
                child: cluster,
            });
            try {
                btn.style =
                    `background-color: transparent; border: none; padding: 0;` +
                    `border-radius: 999px; width: ${clusterW}px; height: ${clusterH}px;` +
                    `min-width: ${clusterW}px; min-height: ${clusterH}px;`;
            } catch (e) {}
            wirePressedClass(btn);
            btn.connect('clicked', () => ws.activate(global.get_current_time()));
            box.add_child(btn);
        }
    };

    rebuild();
    const ids = [];
    try { ids.push(['m', manager.connect('active-workspace-changed', scheduleRebuild)]); } catch (e) {}
    try { ids.push(['m', manager.connect('notify::n-workspaces', scheduleRebuild)]); } catch (e) {}
    try { ids.push(['d', global.display.connect('restacked', scheduleRebuild)]); } catch (e) {}
    try { ids.push(['d', global.display.connect('window-created', scheduleRebuild)]); } catch (e) {}
    try { ids.push(['d', global.display.connect('notify::focus-window', scheduleRebuild)]); } catch (e) {}
    try { ids.push(['w', global.window_manager.connect('switch-workspace', scheduleRebuild)]); } catch (e) {}

    box.connect('destroy', () => {
        if (rebuildTimer) {
            try { GLib.source_remove(rebuildTimer); } catch (e) {}
            rebuildTimer = 0;
        }
        for (const [kind, id] of ids) {
            try {
                if (kind === 'm')
                    manager.disconnect(id);
                else if (kind === 'd')
                    global.display.disconnect(id);
                else
                    global.window_manager.disconnect(id);
            } catch (e) {}
        }
    });

    return box;
}
