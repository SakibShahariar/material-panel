import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gvc from 'gi://Gvc';

// Gvc is the same library GNOME Shell's own quick settings volume slider
// uses internally - it's a system typelib, not something we bundle.
export function buildVolume() {
    let control;
    try {
        control = new Gvc.MixerControl({name: 'material-panel'});
        control.open();
    } catch (e) {
        logError(e, 'material-panel: Gvc unavailable, skipping volume module');
        return null;
    }

    const box = new St.BoxLayout({
        style_class: 'material-panel-volume material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        reactive: true,
    });
    const icon = new St.Icon({style_class: 'material-panel-volume-icon', icon_size: 15});
    const label = new St.Label({style_class: 'material-panel-volume-label', y_align: Clutter.ActorAlign.CENTER});
    box.add_child(icon);
    box.add_child(label);

    let sink = null;
    let sinkVolumeId = 0;
    let sinkMuteId = 0;

    const iconNameFor = pct => {
        if (!sink || sink.is_muted || pct === 0)
            return 'audio-volume-muted-symbolic';
        if (pct >= 66)
            return 'audio-volume-high-symbolic';
        if (pct >= 33)
            return 'audio-volume-medium-symbolic';
        return 'audio-volume-low-symbolic';
    };

    const update = () => {
        if (!sink)
            return;
        const pct = Math.round((sink.volume / control.get_vol_max_norm()) * 100);
        icon.icon_name = iconNameFor(pct);
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

    box.connect('button-press-event', () => {
        if (sink)
            sink.change_is_muted(!sink.is_muted);
        return Clutter.EVENT_STOP;
    });

    box.connect('destroy', () => {
        control.disconnect(stateId);
        control.disconnect(defaultSinkId);
        if (sink) {
            if (sinkVolumeId) sink.disconnect(sinkVolumeId);
            if (sinkMuteId) sink.disconnect(sinkMuteId);
        }
        control.close();
    });

    return box;
}
