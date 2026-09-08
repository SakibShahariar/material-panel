/**
 * Workspaces — end4 style: active workspace shows overlapping app icons
 * in a soft pill with a primary ring on the focused app; empty = dots.
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import {wirePressedClass} from '../lib/pressFx.js';

const MAX_ICONS = 4;

function _windowsOnWorkspace(ws) {
    try {
        return (ws.list_windows() || []).filter(w => {
            try {
                if (w.is_skip_taskbar?.())
                    return false;
            } catch (e) {}
            try {
                if (w.minimized)
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
            const id = app.get_id?.() || app.get_name?.() || String(apps.length);
            if (seen.has(id))
                continue;
            seen.add(id);
            const gicon = app.get_icon?.();
            if (!gicon)
                continue;
            apps.push({app, gicon, win});
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
        style_class: 'material-panel-workspaces',
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        box.style = 'spacing: 6px;';
    } catch (e) {}

    const manager = global.workspace_manager;
    const iconSize = Math.max(14, Math.round(18 * (scale || 1)));
    const overlap = Math.round(iconSize * 0.35);

    const rebuild = () => {
        box.destroy_all_children();
        const end4 = globalThis._materialPanelLayoutStyle === 'end4';
        const activeIndex = manager.get_active_workspace_index();
        const n = manager.get_n_workspaces();
        const focusId = _focusAppId();

        for (let i = 0; i < n; i++) {
            const active = i === activeIndex;
            const ws = manager.get_workspace_by_index(i);
            const apps = end4 ? _appsOnWorkspace(ws) : [];

            if (end4 && apps.length > 0) {
                // Cluster of app icons (end4 / screenshot style)
                const cluster = new St.BoxLayout({
                    style_class: active
                        ? 'material-panel-ws-cluster active'
                        : 'material-panel-ws-cluster',
                    y_align: Clutter.ActorAlign.CENTER,
                });
                try {
                    cluster.style = active
                        ? `spacing: -${overlap}px; padding: 3px 8px; border-radius: 999px;`
                        : `spacing: -${Math.round(overlap * 0.7)}px; padding: 2px 6px; border-radius: 999px;`;
                } catch (e) {}

                apps.forEach((entry, idx) => {
                    const isFocus = active && focusId &&
                        (entry.app.get_id?.() === focusId || entry.app.get_name?.() === focusId);
                    const wrap = new St.Bin({
                        style_class: isFocus
                            ? 'material-panel-ws-app-ring active'
                            : 'material-panel-ws-app-ring',
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER,
                    });
                    const sz = active ? iconSize : Math.max(12, iconSize - 4);
                    try {
                        wrap.style = isFocus
                            ? `padding: 2px; border-radius: 999px; border: 2px solid;`
                            : `padding: 1px; border-radius: 999px; border: 2px solid transparent;`;
                    } catch (e) {}
                    const img = new St.Icon({
                        style_class: 'material-panel-workspace-app',
                        gicon: entry.gicon,
                        icon_size: sz,
                    });
                    wrap.set_child(img);
                    // Raise focused / later icons for overlap order
                    try {
                        wrap.set_style_class_name(
                            (isFocus ? 'material-panel-ws-app-ring active' : 'material-panel-ws-app-ring') +
                            ` z${idx}`
                        );
                    } catch (e) {}
                    cluster.add_child(wrap);
                });

                const btn = new St.Button({
                    style_class: active
                        ? 'material-panel-workspace-btn app active cluster'
                        : 'material-panel-workspace-btn app cluster',
                    reactive: true,
                    track_hover: true,
                    can_focus: true,
                    child: cluster,
                });
                wirePressedClass(btn);
                btn.connect('clicked', () => ws.activate(global.get_current_time()));
                box.add_child(btn);
            } else if (end4) {
                // Empty workspace — small dot
                const btn = new St.Button({
                    style_class: active
                        ? 'material-panel-workspace-btn material-panel-workspace-dot active'
                        : 'material-panel-workspace-btn material-panel-workspace-dot',
                    reactive: true,
                    track_hover: true,
                    can_focus: true,
                });
                try {
                    btn.style = active
                        ? 'width: 10px; height: 10px; min-width: 10px; min-height: 10px; padding: 0; border-radius: 999px;'
                        : 'width: 8px; height: 8px; min-width: 8px; min-height: 8px; padding: 0; border-radius: 999px;';
                } catch (e) {}
                wirePressedClass(btn);
                btn.connect('clicked', () => ws.activate(global.get_current_time()));
                box.add_child(btn);
            } else {
                // Default layout — numbered pills
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
        }
    };

    rebuild();
    const changedId = manager.connect('active-workspace-changed', rebuild);
    const nChangedId = manager.connect('notify::n-workspaces', rebuild);
    let restackId = 0;
    let focusId = 0;
    try {
        restackId = global.display.connect('restacked', () => rebuild());
    } catch (e) {}
    try {
        focusId = global.display.connect('notify::focus-window', () => rebuild());
    } catch (e) {}

    box.connect('destroy', () => {
        try { manager.disconnect(changedId); } catch (e) {}
        try { manager.disconnect(nChangedId); } catch (e) {}
        if (restackId) {
            try { global.display.disconnect(restackId); } catch (e) {}
        }
        if (focusId) {
            try { global.display.disconnect(focusId); } catch (e) {}
        }
    });

    return box;
}
