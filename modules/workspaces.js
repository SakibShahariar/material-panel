/**
 * end-4 style workspaces:
 *  - Soft chip pill background (like other panel chips)
 *  - Overlapping app icons via negative margin (St ignores negative spacing)
 *  - Primary ring on focused app
 *  - Empty workspaces = small dots
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import {wirePressedClass} from '../lib/pressFx.js';

const MAX_ICONS = 5;

function _windowsOnWorkspace(ws) {
    try {
        return (ws.list_windows() || []).filter(w => {
            try {
                if (typeof w.is_skip_taskbar === 'function' && w.is_skip_taskbar())
                    return false;
            } catch (e) {}
            try {
                if (w.minimized)
                    return false;
            } catch (e) {}
            // Skip desktop / shell
            try {
                const t = w.get_window_type?.();
                    return false;
            } catch (e) {}
            return true;
        });
    } catch (e) {
        return [];
    }
}

function _appsOnWorkspace(ws) {
    const tracker = Shell.WindowTracker.get_default();
    const seen = new Set();
    const apps = [];
    for (const win of _windowsOnWorkspace(ws)) {
        try {
            const app = tracker.get_window_app(win);
            if (!app)
                continue;
            const id = app.get_id?.() || app.get_name?.() || `w${apps.length}`;
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
        return app?.get_id?.() || app?.get_name?.() || null;
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
    // How much each icon pulls left under the previous
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
            const apps = _appsOnWorkspace(ws);

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
                        `padding: 0; border-radius: 999px; border: none;`;
                } catch (e) {}
                wirePressedClass(dot);
                dot.connect('clicked', () => ws.activate(global.get_current_time()));
                box.add_child(dot);
                continue;
            }

            // Pill + overlapping icons
            const cluster = new St.BoxLayout({
                style_class: active
                    ? 'material-panel-ws-cluster active'
                    : 'material-panel-ws-cluster',
                y_align: Clutter.ActorAlign.CENTER,
                reactive: false,
            });
            try {
                cluster.style =
                    'spacing: 0; padding: 3px 6px; border-radius: 999px;';
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
                const sz = iconSize;
                try {
                    // Negative margin = real overlap (St BoxLayout spacing cannot go negative)
                    const ml = idx === 0 ? 0 : -pull;
                    ring.style = isFocus
                        ? `margin-left: ${ml}px; padding: 2px; border-radius: 999px;` +
                          `border: 2px solid; background-color: transparent;`
                        : `margin-left: ${ml}px; padding: 2px; border-radius: 999px;` +
                          `border: 2px solid transparent;`;
                } catch (e) {}

                const img = new St.Icon({
                    style_class: 'material-panel-workspace-app',
                    gicon: entry.gicon,
                    icon_size: sz,
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
