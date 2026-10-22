/** Parse the first nvidia-smi CSV row, including GPU names containing commas. */
export function parseNvidiaSmiOutput(text) {
    const value = String(text ?? '').trim();
    if (!value || /error|not found|failed|NVIDIA-SMI has failed/i.test(value))
        return null;
    const parts = value.split('\n')[0].split(',').map(part => part.trim());
    if (parts.length < 5)
        return null;
    const numberOrNull = raw => {
        const n = Number.parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
    };
    return {
        vendor: 'NVIDIA',
        name: parts.slice(0, -4).join(', ') || 'NVIDIA',
        util: numberOrNull(parts[parts.length - 4]),
        memUsed: numberOrNull(parts[parts.length - 3]),
        memTotal: numberOrNull(parts[parts.length - 2]),
        temp: numberOrNull(parts[parts.length - 1]),
    };
}
