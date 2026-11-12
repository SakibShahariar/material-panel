/**
 * Select the correct UPower source for a battery chip.
 *
 * UPower's DisplayDevice combines physical batteries using their energy
 * capacities. Prefer it when more than one battery is present; for a single
 * battery keep the historical physical-device behavior.
 */
function isPresent(device) {
    try {
        return Boolean(device) && device.is_present !== false;
    } catch (e) {
        return false;
    }
}

export function selectBatteryDevice(devices, displayDevice, batteryKind) {
    const physical = (Array.isArray(devices) ? devices : []).filter(device => {
        try {
            return isPresent(device) &&
                (device.kind === batteryKind ||
                    (device.native_path && String(device.native_path).includes('BAT')));
        } catch (e) {
            return false;
        }
    });
    const aggregate = isPresent(displayDevice) ? displayDevice : null;
    return {
        device: physical.length > 1
            ? (aggregate || physical[0])
            : (physical[0] || aggregate || null),
        batteryCount: physical.length,
        isAggregate: physical.length > 1 && Boolean(aggregate),
    };
}

/**
 * Read UPower's system-wide power-source state. The client property is more
 * authoritative than inferring AC/battery power from one battery's state;
 * retain the device-state fallback for older or partially available clients.
 */
export function getSystemOnBatteryState(client, fallbackDeviceState, deviceStates = {}) {
    try {
        const getter = client?.get_on_battery;
        if (typeof getter === 'function') {
            const value = getter.call(client);
            if (typeof value === 'boolean')
                return value;
        }
    } catch (error) {}

    try {
        const value = client?.on_battery;
        if (typeof value === 'boolean')
            return value;
    } catch (error) {}

    const matches = (...names) => names.some(name =>
        deviceStates?.[name] !== undefined && fallbackDeviceState === deviceStates[name]);
    if (matches('DISCHARGING', 'PENDING_DISCHARGE', 'EMPTY'))
        return true;
    if (matches('CHARGING', 'PENDING_CHARGE', 'FULLY_CHARGED'))
        return false;
    return null;
}
