/** Pure network-counter arithmetic, kept free of GJS imports for regression tests. */
export function calculateRates(previous, current) {
    if (!previous || !current)
        return {down: 0, up: 0};
    const previousRx = Number(previous.rx);
    const previousTx = Number(previous.tx);
    const currentRx = Number(current.rx);
    const currentTx = Number(current.tx);
    if (![previousRx, previousTx, currentRx, currentTx].every(Number.isFinite))
        return {down: 0, up: 0};
    // Counters can reset when an interface reconnects or a device is reset.
    return {
        down: Math.max(0, currentRx - previousRx),
        up: Math.max(0, currentTx - previousTx),
    };
}
