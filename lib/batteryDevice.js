/**
 * Select the correct UPower source for a battery chip.
 *
 * UPower's DisplayDevice combines physical batteries using their energy
 * capacities. Prefer it when more than one battery is present; for a single
 * battery keep the historical physical-device behavior.
 */
export function selectBatteryDevice(devices, displayDevice, batteryKind) {
    const physical = (Array.isArray(devices) ? devices : []).filter(device => {
        try {
            return device && device.is_present !== false &&
                (device.kind === batteryKind ||
                    (device.native_path && String(device.native_path).includes('BAT')));
        } catch (e) {
            return false;
        }
    });
    return {
        device: physical.length > 1
            ? (displayDevice || physical[0])
            : (physical[0] || displayDevice || null),
        batteryCount: physical.length,
        isAggregate: physical.length > 1 && Boolean(displayDevice),
    };
}
