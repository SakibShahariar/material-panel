/** Convert filesystem attributes to a validated, display-ready usage record. */
export function calculateDiskUsage({size, used, free, filesystemId = null, mount = '/'}) {
    const total = Number(size);
    const freeBytes = Number(free);
    const usedBytes = Number(used);
    if (!Number.isFinite(total) || total <= 0)
        return null;
    const usedN = Number.isFinite(usedBytes) && usedBytes >= 0
        ? usedBytes
        : Math.max(0, total - (Number.isFinite(freeBytes) ? freeBytes : 0));
    const available = Number.isFinite(freeBytes)
        ? Math.max(0, freeBytes)
        : Math.max(0, total - usedN);
    return {
        size: total,
        used: usedN,
        avail: available,
        pct: Math.max(0, Math.min(100, Math.round((usedN / total) * 100))),
        filesystemId: filesystemId ? String(filesystemId) : null,
        mount,
    };
}

/** null means identity is unavailable, so callers should not assume sharing. */
export function sameFilesystem(first, second) {
    if (!first?.filesystemId || !second?.filesystemId)
        return null;
    return first.filesystemId === second.filesystemId;
}
