import GLib from 'gi://GLib';

/** Detailed lifecycle diagnostics are opt-in; errors remain logged normally. */
export function debugLog(message) {
    if (GLib.getenv('MATERIAL_PANEL_DEBUG') === '1')
        log('material-panel: ' + message);
}
