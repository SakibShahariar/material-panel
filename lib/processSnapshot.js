/** Parse ps output into a reusable process snapshot without touching the UI. */
export function parseProcessSnapshot(text) {
    const rows = [];
    for (const line of String(text ?? '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 4)
            continue;
        const [pid, pcpu, pmem] = parts;
        const comm = parts.slice(3).join(' ');
        if (!/^\d+$/.test(pid) || !Number.isFinite(Number(pcpu)) ||
            !Number.isFinite(Number(pmem)) || !comm || comm === 'ps')
            continue;
        rows.push({pid, pcpu: String(Number(pcpu)), pmem: String(Number(pmem)), comm});
    }
    return rows;
}

/** Filter and sort a cached snapshot; never launches a subprocess. */
export function filterAndSortProcesses(snapshot, query = '', sortBy = 'cpu', limit = 12) {
    const needle = String(query ?? '').trim().toLowerCase();
    const metric = sortBy === 'mem' ? 'pmem' : 'pcpu';
    return (Array.isArray(snapshot) ? snapshot : [])
        .filter(row => !needle || `${row.comm} ${row.pid}`.toLowerCase().includes(needle))
        .slice()
        .sort((a, b) => Number(b[metric]) - Number(a[metric]))
        .slice(0, Math.max(0, limit));
}
