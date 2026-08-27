import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Gvc from 'gi://Gvc';

import {iconPathPrimary} from '../lib/iconTheme.js';
import {getMixerControl} from '../lib/audio.js';

// Shared control so the chip and QS slider share one sink object —
// volume changes from the slider emit notify::volume on the same
// GObject the chip listens to (fixes chip stuck at old %).
export function buildVolume(_extensionPath, scale = 1.0) {
    const control = getMixerControl();
    if (!control) {
        logError(new Error('material-panel: Gvc unavailable, skipping volume module'));
        return null;
    }

    const box = new St.BoxLayout({
        style_class: 'material-panel-volume material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        reactive: true,
    });
    const icon = new St.Icon({style_class: 'material-panel-volume-icon', icon_size: Math.round(17 * scale)});
    const label = new St.Label({style_class: 'material-panel-volume-label', y_align: Clutter.ActorAlign.CENTER});
    box.add_child(icon);
    box.add_child(label);

    const setIcon = key => {
        icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary(key)));
    };

    let sink = null;
    let sinkVolumeId = 0;
    let sinkMuteId = 0;

    const update = () => {
        if (!sink)
            return;
        const pct = Math.round((sink.volume / control.get_vol_max_norm()) * 100);
        let key;
        if (sink.is_muted || pct === 0) key = 'volume-muted';
        else if (pct >= 66) key = 'volume-high';
        else if (pct >= 33) key = 'volume-medium';
        else key = 'volume-low';
        setIcon(key);
        label.text = sink.is_muted ? 'mute' : `${pct}%`;
    };

    const attachSink = () => {
        if (sink) {
            if (sinkVolumeId) sink.disconnect(sinkVolumeId);
            if (sinkMuteId) sink.disconnect(sinkMuteId);
        }
        sink = control.get_default_sink();
        if (sink) {
            sinkVolumeId = sink.connect('notify::volume', update);
            sinkMuteId = sink.connect('notify::is-muted', update);
        }
        update();
    };

    const stateId = control.connect('state-changed', (_c, state) => {
        if (state === Gvc.MixerControlState.READY)
            attachSink();
    });
    const defaultSinkId = control.connect('default-sink-changed', attachSink);
    // If already READY (e.g. QS opened first), attach immediately
    try {
        if (control.get_state() === Gvc.MixerControlState.READY)
            attachSink();
    } catch (e) {}

    box.connect('button-press-event', () => {
        if (sink)
            sink.change_is_muted(!sink.is_muted);
        return Clutter.EVENT_STOP;
    });

    box.connect('destroy', () => {
        try { control.disconnect(stateId); } catch (e) {}
        try { control.disconnect(defaultSinkId); } catch (e) {}
        if (sink) {
            if (sinkVolumeId) try { sink.disconnect(sinkVolumeId); } catch (e) {}
            if (sinkMuteId) try { sink.disconnect(sinkMuteId); } catch (e) {}
        }
        // Do NOT close shared control here — QS/other chip may still need it
    });

    return box;
}
