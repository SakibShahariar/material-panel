/** Pure network-counter arithmetic, kept free of GJS imports for regression tests. */
export function calculateRates(previous, current, elapsedSeconds = 1) {
    if (!previous || !current || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0)
        return {down: 0, up: 0};
    const previousRx = Number(previous.rx);
    const previousTx = Number(previous.tx);
    const currentRx = Number(current.rx);
    const currentTx = Number(current.tx);
    if (![previousRx, previousTx, currentRx, currentTx].every(Number.isFinite))
        return {down: 0, up: 0};
    // Counters can reset when an interface reconnects or a device is reset.
    return {
        down: Math.max(0, currentRx - previousRx) / elapsedSeconds,
        up: Math.max(0, currentTx - previousTx) / elapsedSeconds,
    };
}


/** A new active interface needs a fresh counter baseline before rates resume. */
export function hasInterfaceChanged(previousInterface, currentInterface) {
    return Boolean(currentInterface) && currentInterface !== previousInterface;
}
