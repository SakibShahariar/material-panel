/**
 * Return the next focusable actor index for cyclic popup navigation.
 *
 * When focus is outside the list, start at the first or last actor according
 * to direction. An empty list has no valid destination.
 */
export function getAdjacentFocusableIndex(length, focusedIndex, direction) {
    if (!Number.isInteger(length) || length <= 0)
        return -1;

    const step = typeof direction === 'number' && Number.isFinite(direction) && direction < 0 ? -1 : 1;
    if (!Number.isInteger(focusedIndex) || focusedIndex < 0 || focusedIndex >= length)
        return step > 0 ? 0 : length - 1;

    return (focusedIndex + step + length) % length;
}
