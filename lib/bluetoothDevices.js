/**
 * Normalize BlueZ ObjectManager data for both Bluetooth device surfaces.
 * Keep the original property variants intact for callers that need D-Bus values.
 */
function unpack(value) {
    try {
        return value?.deep_unpack?.() ?? value ?? null;
    } catch (e) {
        return null;
    }
}

export function getBluetoothDevices(objects = {}) {
    const devices = Object.entries(objects)
        .filter(([, interfaces]) => interfaces && 'org.bluez.Device1' in interfaces)
        .map(([path, interfaces]) => {
            const props = interfaces['org.bluez.Device1'] || {};
            const battery = interfaces['org.bluez.Battery1'];
            const batteryPct = unpack(battery?.Percentage);
            return {
                path,
                props,
                batteryPct: batteryPct == null ? null : Number(batteryPct),
                paired: unpack(props.Paired) === true,
                connected: unpack(props.Connected) === true,
                name: unpack(props.Alias) ?? unpack(props.Name) ?? null,
            };
        });

    const pairedDevices = devices
        .filter(device => device.paired)
        .sort((a, b) => Number(b.connected) - Number(a.connected));
    const nearbyDevices = devices.filter(device =>
        !device.paired && !!unpack(device.props.Name));

    return {pairedDevices, nearbyDevices};
}
