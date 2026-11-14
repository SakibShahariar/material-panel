/**
 * Dispatch one normalized Quick Launch entry through injected GNOME adapters.
 * Keeping the decision logic pure makes launch behavior testable without a Shell session.
 */
export function launchQuickLaunchEntry(entry, {
    getDesktopAppInfo,
    parseCommand,
    spawnCommand,
    onError,
    commandTarget = entry.target,
    onComplete,
}) {
    let completionSent = false;
    const complete = (success, error = null) => {
        if (completionSent)
            return false;
        completionSent = true;
        try {
            onComplete?.(success === true, error);
        } catch (callbackError) {
            try { onError?.(entry, callbackError); } catch (ignored) {}
        }
        return true;
    };

    try {
        if (entry.type === 'app') {
            const app = getDesktopAppInfo(entry.target);
            if (!app)
                throw new Error('This application is no longer installed.');
            if (!app.launch([], null))
                throw new Error('GNOME could not start this application.');
            complete(true);
            return true;
        }

        if (entry.type !== 'command')
            throw new Error('Unsupported quick-launch entry type.');

        const argv = parseCommand(commandTarget);
        if (!Array.isArray(argv) || argv.length === 0)
            throw new Error('Enter an executable followed by optional arguments.');
        spawnCommand(argv, (success, error = null) => complete(success, error));
        return true;
    } catch (error) {
        if (completionSent)
            return true;
        try { onError?.(entry, error); } catch (callbackError) {}
        complete(false, error);
        return false;
    }
}


/** Describe a failed command without exposing its arguments or environment. */
export function describeQuickLaunchProcessFailure({
    didExit = false,
    exitStatus = null,
    didSignal = false,
    termSignal = null,
} = {}) {
    if (didExit && Number.isInteger(exitStatus))
        return `Command exited with status ${exitStatus}.`;
    if (didSignal && Number.isInteger(termSignal))
        return `Command was terminated by signal ${termSignal}.`;
    return 'Command exited unsuccessfully.';
}


/**
 * Keep notification failures separate from the result of an action that already succeeded.
 * A desktop notification service must never decide whether a command toggle changed state.
 */
export function notifyQuickLaunchSuccess(notify, onSuccess = null, onError = null) {
    try {
        notify?.();
    } catch (error) {
        try { onError?.(error); } catch (ignored) {}
    }

    try {
        onSuccess?.();
        return true;
    } catch (error) {
        try { onError?.(error); } catch (ignored) {}
        return false;
    }
}


/** Report a failed action without allowing notification or logging errors to escape. */
export function notifyQuickLaunchFailure(notify, onError = null) {
    try {
        notify?.();
        return true;
    } catch (error) {
        try { onError?.(error); } catch (ignored) {}
        return false;
    }
}
