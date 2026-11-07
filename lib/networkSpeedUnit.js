/**
 * Shared live preference for network rate display units.
 * Both the Network Speed chip and CPU summary read the same normalized value.
 */
let unit = 'bytes';

export function setNetworkSpeedUnit(value) {
    unit = value === 'bits' ? 'bits' : 'bytes';
}

export function getNetworkSpeedUnit() {
    return unit;
}

export function clearNetworkSpeedUnit() {
    unit = 'bytes';
}
