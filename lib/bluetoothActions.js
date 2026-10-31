import Gio from 'gi://Gio';

const BLUEZ_SERVICE = 'org.bluez';
const DEVICE_IFACE = 'org.bluez.Device1';

export function getBluetoothDeviceActionSteps({paired = true, connected = false} = {}) {
    const action = connected ? 'Disconnect' : 'Connect';
    return action === 'Connect' && !paired ? ['Pair', 'Connect'] : [action];
}

/**
 * Run the BlueZ Pair/Connect/Disconnect sequence shared by the Bluetooth
 * popup and Quick Settings device rows.
 *
 * callback(error, action) is called once. The caller owns UI state and refresh.
 */
export function runBluetoothDeviceAction({
    path,
    paired = true,
    connected = false,
    timeoutMs = 10_000,
    cancellable = null,
}, callback) {
    const steps = getBluetoothDeviceActionSteps({paired, connected});
    const action = steps.at(-1);
    let completed = false;
    const finish = error => {
        if (completed)
            return;
        completed = true;
        callback(error ?? null, action);
    };

    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
        BLUEZ_SERVICE, path, DEVICE_IFACE, cancellable,
        (_source, result) => {
            let proxy;
            try {
                proxy = Gio.DBusProxy.new_for_bus_finish(result);
            } catch (error) {
                finish(error);
                return;
            }

            const runStep = index => {
                if (index >= steps.length) {
                    finish(null);
                    return;
                }
                proxy.call(
                    steps[index], null, Gio.DBusCallFlags.NONE,
                    timeoutMs, cancellable,
                    (source, callResult) => {
                        try {
                            source.call_finish(callResult);
                            runStep(index + 1);
                        } catch (error) {
                            finish(error);
                        }
                    });
            };
            runStep(0);
        });
}
