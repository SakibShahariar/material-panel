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

 
/** Parse every nvidia-smi CSV row; GPU names may themselves contain commas. */
export function parseNvidiaSmiOutputs(text) {
    return String(text ?? '').trim().split('\n')
        .map((line, index) => {
            const value = parseNvidiaSmiOutput(line);
            return value ? {...value, card: 'nvidia-smi-' + index} : null;
        })
        .filter(Boolean);
}

/** Prefer the device exposing the most useful metrics, not the lowest card number. */
export function selectGpuCandidate(candidates, preferredCard = null) {
    const score = candidate => {
        let value = 0;
        if (Number.isFinite(candidate.util)) value += 4;
        if (Number.isFinite(candidate.memUsed)) value += 2;
        if (Number.isFinite(candidate.memTotal)) value += 2;
        if (Number.isFinite(candidate.temp)) value += 1;
        return value;
    };
    return [...(candidates ?? [])]
        .filter(candidate => candidate &&
            ['util', 'memUsed', 'memTotal', 'temp'].some(key => Number.isFinite(candidate[key])))
        .sort((a, b) => {
            const scoreDiff = score(b) - score(a);
            if (scoreDiff) return scoreDiff;
            if (preferredCard != null) {
                const aPreferred = a.card === preferredCard ? 1 : 0;
                const bPreferred = b.card === preferredCard ? 1 : 0;
                if (aPreferred !== bPreferred) return bPreferred - aPreferred;
            }
            const cardNumber = card => {
                const match = String(card ?? '').match(/card(\d+)/);
                return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
            };
            return cardNumber(a.card) - cardNumber(b.card);
        })[0] ?? null;
}
