import GLib from 'gi://GLib';

// Resolve symlinks in every path component, not just the final directory.
// Restart after each link so parent-directory symlinks and chains are followed.
export function resolveSymlinkPath(path, maxHops = 32) {
    let current = GLib.canonicalize_filename(path, null);
    const seen = new Set();
    for (let hop = 0; hop < maxHops; hop++) {
        if (seen.has(current))
            return current;
        seen.add(current);
        const parts = current.split('/').filter(Boolean);
        let prefix = '/';
        let replaced = false;
        for (let i = 0; i < parts.length; i++) {
            prefix = prefix === '/' ? '/' + parts[i] : prefix + '/' + parts[i];
            let target;
            try {
                target = GLib.file_read_link(prefix);
            } catch (e) {
                continue;
            }
            if (!target)
                continue;
            const resolvedTarget = target.startsWith('/')
                ? target
                : GLib.canonicalize_filename(target, GLib.path_get_dirname(prefix));
            const remainder = parts.slice(i + 1).join('/');
            current = GLib.canonicalize_filename(
                remainder ? resolvedTarget + '/' + remainder : resolvedTarget, null);
            replaced = true;
            break;
        }
        if (!replaced)
            return current;
    }
    // Break pathological/cyclic chains safely rather than hanging the watcher.
    return current;
}
