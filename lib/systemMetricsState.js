/**
 * Latest lightweight GPU and network samples shared with the Activity chip.
 * Each producer owns clearing its sample when its panel module is destroyed.
 */
let gpuMetrics = null;
let networkMetrics = null;

function copyMetrics(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? {...value}
        : null;
}

export function setGpuMetrics(value) {
    gpuMetrics = copyMetrics(value);
}

export function getGpuMetrics() {
    return copyMetrics(gpuMetrics);
}

export function clearGpuMetrics() {
    gpuMetrics = null;
}

export function setNetworkMetrics(value) {
    networkMetrics = copyMetrics(value);
}

export function getNetworkMetrics() {
    return copyMetrics(networkMetrics);
}

export function clearNetworkMetrics() {
    networkMetrics = null;
}
