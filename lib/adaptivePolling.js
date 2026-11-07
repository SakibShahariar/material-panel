/** Pure adaptive interval state; callers own the actual timer and its lifecycle. */
export function createAdaptivePollSchedule({
    baseIntervalMs,
    minIntervalMs = baseIntervalMs,
    maxIntervalMs = baseIntervalMs,
    stableSamplesToSlow = 4,
    growthFactor = 1.5,
    jitterRatio = 0.08,
    jitterMode = 'symmetric',
    random = Math.random,
} = {}) {
    const finiteNumber = value => {
        try {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        } catch (e) {
            return null;
        }
    };
    const finitePositive = (value, fallback) => {
        const parsed = finiteNumber(value);
        return parsed !== null && parsed > 0 ? parsed : fallback;
    };
    const base = finitePositive(baseIntervalMs, 1000);
    const minimum = Math.min(
        finitePositive(minIntervalMs, base),
        finitePositive(maxIntervalMs, base),
    );
    const maximum = Math.max(
        finitePositive(minIntervalMs, base),
        finitePositive(maxIntervalMs, base),
    );
    const stableLimit = Math.max(1, Math.floor(finitePositive(stableSamplesToSlow, 4)));
    const growth = Math.max(1, finitePositive(growthFactor, 1.5));
    const jitterValue = finiteNumber(jitterRatio);
    const jitter = Math.max(0, Math.min(0.5, jitterValue ?? 0.08));

    let intervalMs = Math.max(minimum, Math.min(maximum, base));
    let stableCount = 0;

    const reset = () => {
        intervalMs = Math.max(minimum, Math.min(maximum, base));
        stableCount = 0;
    };

    return {
        nextDelay(isActive = false) {
            if (isActive) {
                reset();
            } else {
                stableCount++;
                if (stableCount >= stableLimit) {
                    intervalMs = Math.min(maximum, Math.max(minimum, Math.round(intervalMs * growth)));
                    stableCount = 0;
                }
            }
            let randomValue = 0.5;
            try {
                const value = Number(random());
                if (Number.isFinite(value))
                    randomValue = Math.max(0, Math.min(1, value));
            } catch (e) {}
            const offset = intervalMs * jitter * (jitterMode === 'positive' ? randomValue : (randomValue * 2) - 1);
            return Math.max(1, Math.round(intervalMs + offset));
        },
        reset,
        getIntervalMs() {
            return intervalMs;
        },
    };
}
