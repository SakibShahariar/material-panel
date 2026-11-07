/**
 * Dispatch one normalized Quick Launch entry through injected GNOME adapters.
 * Keeping the decision logic pure makes launch behavior testable without a Shell session.
 */
export function launchQuickLaunchEntry(entry, {
    getDesktopAppInfo,
    parseCommand,
    spawnCommand,
    onError,
}) {
    try {
        if (entry.type === 'app') {
            const app = getDesktopAppInfo(entry.target);
            if (!app)
                throw new Error('This application is no longer installed.');
            if (!app.launch([], null))
                throw new Error('GNOME could not start this application.');
            return true;
        }

        if (entry.type !== 'command')
            throw new Error('Unsupported quick-launch entry type.');

        const argv = parseCommand(entry.target);
        if (!Array.isArray(argv) || argv.length === 0)
            throw new Error('Enter an executable followed by optional arguments.');
        spawnCommand(argv);
        return true;
    } catch (error) {
        onError?.(entry, error);
        return false;
    }
}
