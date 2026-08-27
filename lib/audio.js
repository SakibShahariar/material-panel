import Gvc from 'gi://Gvc';

// Single shared MixerControl for the whole panel — fixes the volume chip
// not updating when the QS slider moves (and vice versa). Previously
// modules/volume.js and modules/quicksettings.js each created their own
// Gvc.MixerControl; each wrapper owns a distinct GObject for the same
// Pulse sink, so notify::volume fired only on the writer's sink. Sharing
// one control means both share one sink object, so notify propagates.
// Pattern mirrors Noctalia/End4: one audio service singleton.

let _control = null;
let _openFailed = false;

export function getMixerControl() {
    if (_control)
        return _control;
    if (_openFailed)
        return null;
    try {
        _control = new Gvc.MixerControl({name: 'material-panel'});
        _control.open();
    } catch (e) {
        logError(e, 'material-panel: Gvc unavailable (audio.js)');
        _control = null;
        _openFailed = true;
        return null;
    }
    return _control;
}

export function closeMixerControl() {
    if (_control) {
        try { _control.close(); } catch (e) {}
        _control = null;
    }
}
