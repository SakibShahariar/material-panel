import GLib from 'gi://GLib';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/** Expandable per-application mixer backed by the shared Gvc control. */
export function buildAppVolumeMixer(control) {
    if (!control)
        return null;

    const section = new PopupMenu.PopupMenuSection();
    const submenu = new PopupMenu.PopupSubMenuMenuItem('Application volumes', false);
    section.addMenuItem(submenu);
    const rows = new Map();
    const streamSignalIds = new Map();
    const controlSignalIds = [];
    let destroyed = false;
    let rebuildQueued = false;

    const getStreams = () => {
        try {
            return typeof control.get_sink_inputs === 'function'
                ? Array.from(control.get_sink_inputs() ?? [])
                : [];
        } catch (e) {
            return [];
        }
    };

    const streamId = stream => {
        try { return stream.get_id?.() ?? stream.id ?? stream; } catch (e) { return stream; }
    };

    const streamLabel = stream => {
        for (const getter of ['get_description', 'get_name', 'get_application_id']) {
            try {
                const value = stream[getter]?.();
                if (value)
                    return String(value);
            } catch (e) {}
        }
        return 'Application';
    };

    const isMuted = stream => {
        try { return Boolean(stream.is_muted ?? stream.get_is_muted?.()); } catch (e) { return false; }
    };

    const volumeOf = stream => {
        try {
            const max = Number(control.get_vol_max_norm?.()) || 65536;
            const value = Number(stream.volume ?? stream.get_volume?.());
            return Number.isFinite(value) ? Math.max(0, Math.min(1, value / max)) : 0;
        } catch (e) {
            return 0;
        }
    };

    const clearRows = () => {
        for (const [stream, ids] of streamSignalIds) {
            for (const id of ids) {
                try { stream.disconnect(id); } catch (e) {}
            }
        }
        streamSignalIds.clear();
        for (const item of rows.values()) {
            for (const child of Array.isArray(item) ? item : [item]) {
                try { submenu.menu.removeMenuItem(child); } catch (e) {}
            }
        }
        rows.clear();
    };

    const rebuild = () => {
        if (destroyed)
            return;
        clearRows();
        const streams = getStreams();
        if (streams.length === 0) {
            const empty = new PopupMenu.PopupMenuItem('No active application audio', {
                reactive: false,
            });
            submenu.menu.addMenuItem(empty);
            rows.set('empty', empty);
            submenu.label.text = 'Application volumes';
            return;
        }

        for (const stream of streams) {
            const id = streamId(stream);
            const row = new PopupMenu.PopupMenuItem(streamLabel(stream), {reactive: false});
            const slider = new PopupMenu.PopupSliderMenuItem(volumeOf(stream));
            const mute = new PopupMenu.PopupSwitchMenuItem('Mute', isMuted(stream));
            slider.connect('value-changed', (_item, value) => {
                if (destroyed)
                    return;
                try {
                    const max = Number(control.get_vol_max_norm?.()) || 65536;
                    stream.volume = Math.round(Math.max(0, Math.min(1, value)) * max);
                    stream.push_volume?.();
                } catch (e) {
                    logError(e, 'material-panel: application volume adjustment failed');
                }
            });
            mute.connect('toggled', (_item, active) => {
                if (destroyed)
                    return;
                try {
                    if (typeof stream.change_is_muted === 'function')
                        stream.change_is_muted(active);
                    else
                        stream.is_muted = active;
                } catch (e) {
                    logError(e, 'material-panel: application mute toggle failed');
                }
            });
            submenu.menu.addMenuItem(row);
            submenu.menu.addMenuItem(slider);
            submenu.menu.addMenuItem(mute);
            rows.set(id, [row, slider, mute]);
            const ids = [];
            for (const signal of ['notify::volume', 'notify::is-muted']) {
                try {
                    ids.push(stream.connect(signal, () => {
                        if (destroyed)
                            return;
                        try { slider.setValue(volumeOf(stream)); } catch (e) {}
                        try { mute.setToggleState(isMuted(stream)); } catch (e) {}
                    }));
                } catch (e) {}
            }
            streamSignalIds.set(stream, ids);
        }
        submenu.label.text = 'Application volumes (' + streams.length + ')';
    };

    const queueRebuild = () => {
        if (destroyed || rebuildQueued)
            return;
        rebuildQueued = true;
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            rebuildQueued = false;
            rebuild();
            return GLib.SOURCE_REMOVE;
        });
    };

    for (const signal of ['stream-added', 'stream-removed', 'stream-changed']) {
        try { controlSignalIds.push(control.connect(signal, queueRebuild)); } catch (e) {}
    }
    try { controlSignalIds.push(control.connect('state-changed', queueRebuild)); } catch (e) {}
    rebuild();

    return {
        section,
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            for (const id of controlSignalIds) {
                try { control.disconnect(id); } catch (e) {}
            }
            controlSignalIds.length = 0;
            clearRows();
        },
    };
}
