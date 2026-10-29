/** Pure network-counter arithmetic, kept free of GJS imports for regression tests. */
export function calculateDeltas(previous, current) {
    if (!previous || !current)
        return {rxDelta: 0, txDelta: 0};
    const previousRx = Number(previous.rx);
    const previousTx = Number(previous.tx);
    const currentRx = Number(current.rx);
    const currentTx = Number(current.tx);
    if (![previousRx, previousTx, currentRx, currentTx].every(Number.isFinite))
        return {rxDelta: 0, txDelta: 0};
    // Counter resets and interface changes must never create negative totals.
    return {
        rxDelta: Math.max(0, currentRx - previousRx),
        txDelta: Math.max(0, currentTx - previousTx),
    };
}

export function calculateRates(previous, current, elapsedSeconds = 1) {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0)
        return {down: 0, up: 0};
    const {rxDelta, txDelta} = calculateDeltas(previous, current);
    return {down: rxDelta / elapsedSeconds, up: txDelta / elapsedSeconds};
}


/** A new active interface needs a fresh counter baseline before rates resume. */
export function hasInterfaceChanged(previousInterface, currentInterface) {
    return Boolean(currentInterface) && currentInterface !== previousInterface;
}
