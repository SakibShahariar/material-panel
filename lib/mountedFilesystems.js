const EXCLUDED_MOUNT_ROOTS = [
    '/proc', '/sys', '/dev', '/tmp', '/var/lib/snapd',
];

function isExcludedMount(path) {
    if (EXCLUDED_MOUNT_ROOTS.some(root => path === root || path.startsWith(root + '/')))
        return true;
    // Keep removable media under /run/media, but filter system runtime mounts.
    return path === '/run' || (path.startsWith('/run/') &&
        !path.startsWith('/run/media/'));
}

/** Normalize local mounted filesystem entries for the Disk popup selector. */
export function filterLocalMounts(mounts) {
    const seen = new Set();
    const result = [];
    for (const mount of Array.isArray(mounts) ? mounts : []) {
        if (!mount || typeof mount.path !== 'string' || !mount.path.startsWith('/'))
            continue;
        const path = mount.path.replace(/\/+$/, '') || '/';
        if (isExcludedMount(path) || seen.has(path))
            continue;
        seen.add(path);
        result.push({
            path,
            name: String(mount.name || path),
            removable: mount.removable === true,
        });
    }
    return result.sort((a, b) => a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path));
}
