import GLib from 'gi://GLib';

function fallbackPath(originalPath, reason, error = null) {
    const message = `material-panel: could not resolve symlink path "${originalPath}": ${reason}; falling back to "${originalPath}"`;
    if (error)
        logError(error, message);
    else
        log(message);
    return originalPath;
}

// Resolve symlinks in every path component, not just the final directory.
// Restart after each link so parent-directory symlinks and chains are followed.
export function resolveSymlinkPath(path, maxHops = 32) {
    let originalPath;
    try {
        originalPath = GLib.canonicalize_filename(path, null);
    } catch (e) {
        const fallback = String(path ?? '');
        return fallbackPath(fallback, 'the initial path could not be canonicalized', e);
    }

    let current = originalPath;
    const seen = new Set();
    try {
        for (let hop = 0; hop < maxHops; hop++) {
            if (seen.has(current))
                return fallbackPath(originalPath, 'a symlink cycle was detected');
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
                    // A failed read is normal for ordinary path components. If
                    // GLib confirms this is a symlink, report the real failure.
                    try {
                        if (GLib.file_test(prefix, GLib.FileTest.IS_SYMLINK))
                            return fallbackPath(originalPath, `could not read symlink component "${prefix}"`, e);
                    } catch (testError) {}
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
    } catch (e) {
        return fallbackPath(originalPath, 'an error occurred while resolving a path component', e);
    }

    // Break pathological chains safely rather than watching a partially resolved path.
    return fallbackPath(originalPath, `the symlink chain exceeded the ${maxHops}-hop limit`);
}
