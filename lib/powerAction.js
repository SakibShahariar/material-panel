import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/** Run a fixed argv without a shell and notify only when the action fails. */
export function runPowerAction(label, argv) {
    const notifyFailure = error => {
        logError(error, `material-panel: ${label.toLowerCase()} action failed`);
        try {
            Main.notify('Material Panel', `Could not ${label.toLowerCase()} the system.`);
        } catch (e) {}
    };
    try {
        const process = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        process.wait_check_async(null, (source, result) => {
            try {
                source.wait_check_finish(result);
            } catch (e) {
                notifyFailure(e);
            }
        });
    } catch (e) {
        notifyFailure(e);
    }
}
