import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Gvc from 'gi://Gvc';

import {iconPathPrimary, iconPathOnAccent, iconPath} from '../lib/iconTheme.js';
import {wireFileIconPress, giconForKey} from '../lib/pressFx.js';
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
        track_hover: true,
    });
    const icon = new St.Icon({style_class: 'material-panel-volume-icon', icon_size: Math.round(17 * scale)});
    const label = new St.Label({style_class: 'material-panel-volume-label', y_align: Clutter.ActorAlign.CENTER});
    box.add_child(icon);
    box.add_child(label);

    let currentKey = 'volume-high';
    let press = null;
    const setIcon = key => {
        currentKey = key;
        if (press?.applyIcons) {
            try { press.applyIcons(); } catch (e) {}
        } else {
            const g = giconForKey(key, false);
            if (g)
                icon.gicon = g;
        }
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

    press = wireFileIconPress(box, () => [{icon, key: currentKey}]);

    box.connect('button-press-event', () => {
        if (sink)
            sink.change_is_muted(!sink.is_muted);
        return Clutter.EVENT_STOP;
    });

    // Two-finger / wheel scroll on the chip adjusts volume
    box.reactive = true;
    box.connect('scroll-event', (_a, event) => {
        if (!sink || !control)
            return Clutter.EVENT_PROPAGATE;
        let dir = 0;
        try {
            const d = event.get_scroll_direction();
            if (d === Clutter.ScrollDirection.UP)
                dir = 1;
            else if (d === Clutter.ScrollDirection.DOWN)
                dir = -1;
            else if (d === Clutter.ScrollDirection.SMOOTH) {
                const [, dy] = event.get_scroll_delta();
                if (dy < 0) dir = 1;
                else if (dy > 0) dir = -1;
            }
        } catch (e) {
            return Clutter.EVENT_PROPAGATE;
        }
        if (!dir)
            return Clutter.EVENT_PROPAGATE;
        const max = control.get_vol_max_norm();
        const step = max * 0.04; // 4% per notch
        let next = sink.volume + dir * step;
        next = Math.max(0, Math.min(max, next));
        try {
            if (sink.is_muted && next > 0)
                sink.change_is_muted(false);
        } catch (e) {}
        sink.volume = Math.round(next);
        try { sink.push_volume(); } catch (e) {}
        update();
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
