import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import {wirePressedClass} from '../lib/pressFx.js';

function _windowsOnWorkspace(ws) {
    try {
        return ws.list_windows() || [];
    } catch (e) {
        return [];
    }
}

function _iconForWindows(windows, size) {
    const tracker = Shell.WindowTracker.get_default();
    for (const win of windows) {
        try {
            if (win.minimized || !win.showing_on_its_workspace?.())
                continue;
        } catch (e) {}
        try {
            const app = tracker.get_window_app(win);
            const gicon = app?.get_icon?.();
            if (gicon)
                return gicon;
        } catch (e) {}
    }
    return null;
}

export function buildWorkspaces(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({style_class: 'material-panel-workspaces'});
    const manager = global.workspace_manager;
    const iconSize = Math.max(12, Math.round(14 * (scale || 1)));

    const rebuild = () => {
        box.destroy_all_children();
        const end4 = globalThis._materialPanelLayoutStyle === 'end4';
        const activeIndex = manager.get_active_workspace_index();
        const n = manager.get_n_workspaces();

        for (let i = 0; i < n; i++) {
            const active = i === activeIndex;
            const ws = manager.get_workspace_by_index(i);
            const windows = _windowsOnWorkspace(ws);
            const gicon = end4 ? _iconForWindows(windows, iconSize) : null;

            if (end4 && gicon) {
                // App icon for occupied workspace (end-4 style)
                const img = new St.Icon({
                    style_class: active
                        ? 'material-panel-workspace-app active'
                        : 'material-panel-workspace-app',
                    gicon,
                    icon_size: iconSize,
                });
                const btn = new St.Button({
                    style_class: active
                        ? 'material-panel-workspace-btn app active'
                        : 'material-panel-workspace-btn app',
                    reactive: true,
                    track_hover: true,
                    can_focus: true,
                    child: img,
                });
                wirePressedClass(btn);
                btn.connect('clicked', () => {
                    ws.activate(global.get_current_time());
                });
                box.add_child(btn);
            } else {
                const btn = new St.Button({
                    style_class: active
                        ? 'material-panel-workspace-btn active'
                        : 'material-panel-workspace-btn',
                    label: end4 ? '' : `${i + 1}`,
                    reactive: true,
                    track_hover: true,
                    can_focus: true,
                });
                if (end4)
                    btn.add_style_class_name('material-panel-workspace-dot');
                wirePressedClass(btn);
                btn.connect('clicked', () => {
                    ws.activate(global.get_current_time());
                });
                box.add_child(btn);
            }
        }
    };

    rebuild();
    const changedId = manager.connect('active-workspace-changed', rebuild);
    const nChangedId = manager.connect('notify::n-workspaces', rebuild);
    let restackId = 0;
    try {
        restackId = global.display.connect('restacked', () => {
            // refresh icons when windows move
            rebuild();
        });
    } catch (e) {}

    box.connect('destroy', () => {
        manager.disconnect(changedId);
        manager.disconnect(nChangedId);
        if (restackId) {
            try { global.display.disconnect(restackId); } catch (e) {}
        }
    });

    return box;
}
