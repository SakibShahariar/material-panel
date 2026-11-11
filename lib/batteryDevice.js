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
