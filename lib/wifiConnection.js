/**
 * Start a connection to an unsaved Wi-Fi access point.
 *
 * NetworkManager creates the partial profile from the AP and obtains any
 * required credentials through the session's registered secret agent.
 * Passwords are deliberately never accepted by this adapter.
 */
export function addAndActivateWifiConnection(client, device, accessPoint, {
    onStarted = () => {},
    onError = () => {},
} = {}) {
    const reportError = error => {
        try { onError(error); } catch (ignored) {}
    };

    let specificObject = null;
    try {
        specificObject = accessPoint?.get_path?.() ?? null;
    } catch (e) {}
    if (typeof specificObject !== 'string' ||
        !/^\/[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*$/.test(specificObject)) {
        reportError(new Error('NetworkManager access point path is invalid or unavailable'));
        return false;
    }

    let completionSent = false;
    const fail = error => {
        if (completionSent)
            return false;
        completionSent = true;
        reportError(error);
        return true;
    };

    try {
        client.add_and_activate_connection_async(
            null, device, specificObject, null,
            (source, result) => {
                if (completionSent)
                    return;
                try {
                    const activeConnection = source.add_and_activate_connection_finish(result);
                    if (!activeConnection)
                        throw new Error('NetworkManager did not return an active connection');
                    completionSent = true;
                    try {
                        onStarted(activeConnection);
                    } catch (error) {
                        reportError(error);
                    }
                } catch (error) {
                    fail(error);
                }
            },
        );
        return true;
    } catch (error) {
        return fail(error) ? false : true;
    }
}
