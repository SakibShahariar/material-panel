import Gio from 'gi://Gio';

/** Check Bluetooth rfkill state without blocking the GNOME Shell thread. */
export function checkBluetoothSoftBlocked(callback) {
    try {
        const process = Gio.Subprocess.new(
            ['env', 'LC_ALL=C', 'rfkill', 'list', 'bluetooth'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        process.communicate_utf8_async(null, null, (source, result) => {
            try {
                const [, stdout] = source.communicate_utf8_finish(result);
                callback(String(stdout || '').includes('Soft blocked: yes'));
            } catch (error) {
                callback(false);
            }
        });
    } catch (error) {
        // Never fall back to a synchronous subprocess on the Shell thread.
        callback(false);
    }
}
