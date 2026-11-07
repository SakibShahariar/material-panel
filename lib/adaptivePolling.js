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
    const finitePositive = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    const jitter = Math.max(0, Math.min(0.5, Number.isFinite(Number(jitterRatio))
        ? Number(jitterRatio)
        : 0.08));

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
