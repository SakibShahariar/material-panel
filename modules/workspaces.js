/**
 * end-4 style workspaces:
 *  - Soft chip pill background
 *  - Overlapping app icons via negative margin
 *  - Primary ring on focused app
 *  - Empty workspaces = small dots
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
        const actors = global.get_window_actors?.() || [];
        for (const a of actors) {
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
    // Prefer workspace API
    try {
        const list = ws.list_windows?.() || [];
        for (const w of list)
            wins.push(w);
    } catch (e) {}
    // Fallback: scan all actors
    if (wins.length === 0) {
        for (const w of _allMetaWindows()) {
            try {
                const wsi = w.get_workspace?.();
                if (wsi && wsi.index() === index)
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
            if (typeof w.skip_taskbar !== 'undefined' && w.skip_taskbar)
                return false;
            if (typeof w.is_skip_taskbar === 'function' && w.is_skip_taskbar())
                return false;
        } catch (e) {}
        try {
            const t = w.get_window_type?.();
            if (t === Meta.WindowType.DESKTOP || t === Meta.WindowType.DOCK ||
                t === Meta.WindowType.N_A || t === Meta.WindowType.UTILITY)
                return false;
        } catch (e) {}
        try {
            // Skip our own panel / shell chrome
            if (w.is_on_all_workspaces?.() && !w.get_wm_class?.())
                return false;
        } catch (e) {}
        return true;
    });
}

function _giconForApp(app) {
    if (!app)
        return null;
    try {
        const g = app.get_icon?.();
        if (g)
            return g;
    } catch (e) {}
    return null;
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
            const gicon = _giconForApp(app);
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
    const pull = Math.round(iconSize * 0.42);

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

            const cluster = new St.BoxLayout({
                style_class: active
                    ? 'material-panel-ws-cluster active'
                    : 'material-panel-ws-cluster',
                y_align: Clutter.ActorAlign.CENTER,
                reactive: false,
            });
            try {
                cluster.style = 'spacing: 0; padding: 3px 6px; border-radius: 999px;';
            } catch (e) {}

            apps.forEach((entry, idx) => {
                const isFocus = !!(
                    active && focusId &&
                    (entry.id === focusId ||
                        entry.app.get_id?.() === focusId ||
                        entry.app.get_name?.() === focusId)
                );
                const ring = new St.Bin({
                    style_class: isFocus
                        ? 'material-panel-ws-app-ring active'
                        : 'material-panel-ws-app-ring',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                try {
                    const ml = idx === 0 ? 0 : -pull;
                    ring.style = isFocus
                        ? `margin-left: ${ml}px; padding: 2px; border-radius: 999px; border: 2px solid;`
                        : `margin-left: ${ml}px; padding: 2px; border-radius: 999px; border: 2px solid transparent;`;
                } catch (e) {}
                const img = new St.Icon({
                    style_class: 'material-panel-workspace-app',
                    gicon: entry.gicon,
                    icon_size: iconSize,
                });
                ring.set_child(img);
                cluster.add_child(ring);
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
                    'background-color: transparent; border: none; padding: 0; border-radius: 999px;';
            } catch (e) {}
            wirePressedClass(btn);
            btn.connect('clicked', () => ws.activate(global.get_current_time()));
            box.add_child(btn);
        }
    };

    rebuild();
    const ids = [];
    try { ids.push(['m', manager.connect('active-workspace-changed', rebuild)]); } catch (e) {}
    try { ids.push(['m', manager.connect('notify::n-workspaces', rebuild)]); } catch (e) {}
    try { ids.push(['d', global.display.connect('restacked', () => rebuild())]); } catch (e) {}
    try { ids.push(['d', global.display.connect('window-created', () => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            rebuild();
            return GLib.SOURCE_REMOVE;
        });
    })]); } catch (e) {}
    try { ids.push(['d', global.display.connect('notify::focus-window', () => rebuild())]); } catch (e) {}
    try { ids.push(['w', global.window_manager.connect('switch-workspace', () => rebuild())]); } catch (e) {}

    box.connect('destroy', () => {
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
