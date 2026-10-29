import Gvc from 'gi://Gvc';
import GLib from 'gi://GLib';

// Single shared MixerControl for the whole panel — fixes the volume chip
// not updating when the QS slider moves (and vice versa). Previously
// modules/volume.js and modules/quicksettings.js each created their own
// Gvc.MixerControl; each wrapper owns a distinct GObject for the same
// Pulse sink, so notify::volume fired only on the writer's sink. Sharing
// one control means both share one sink object, so notify propagates.
// Pattern mirrors Noctalia/End4: one audio service singleton.

let _control = null;
let _openFailed = false;
let _retryId = 0;

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
        // Rate-limit retries after a synchronous startup failure. The next
        // consumer request after this cooldown may recreate the shared control.
        if (!_retryId) {
            _retryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
                _retryId = 0;
                _openFailed = false;
                return GLib.SOURCE_REMOVE;
            });
        }
        return null;
    }
    return _control;
}

/** Call from extension disable() so the next enable gets a fresh MixerControl. */
export function closeMixerControl() {
    if (_retryId) {
        try { GLib.source_remove(_retryId); } catch (e) {}
        _retryId = 0;
    }
    if (_control) {
        try { _control.close(); } catch (e) {}
        _control = null;
    }
    _openFailed = false;
}
