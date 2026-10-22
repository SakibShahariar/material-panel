export function parseMemInfoText(text) {
    const map = {};
    for (const line of String(text ?? '').split('\n')) {
        const match = line.match(/^(\w+):\s+(\d+)/);
        if (match)
            map[match[1]] = Number.parseInt(match[2], 10);
    }
    const total = map.MemTotal ?? 0;
    const available = map.MemAvailable ?? map.MemFree ?? 0;
    const free = map.MemFree ?? 0;
    const buffers = map.Buffers ?? 0;
    const cached = (map.Cached ?? 0) + (map.SReclaimable ?? 0);
    const used = Math.max(0, total - available);
    const swapTotal = map.SwapTotal ?? 0;
    const swapFree = map.SwapFree ?? 0;
    const swapUsed = Math.max(0, swapTotal - swapFree);
    return {
        totalKb: total, availableKb: available, usedKb: used, freeKb: free,
        cachedKb: cached, buffersKb: buffers,
        usedPct: total > 0 ? Math.round((used / total) * 100) : 0,
        swapTotalKb: swapTotal, swapUsedKb: swapUsed,
        swapPct: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0,
    };
}
