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
    let specificObject = null;
    try {
        specificObject = accessPoint?.get_path?.() ?? null;
    } catch (e) {}
    if (typeof specificObject !== 'string' || !specificObject) {
        onError(new Error('NetworkManager access point path is unavailable'));
        return false;
    }

    try {
        client.add_and_activate_connection_async(
            null, device, specificObject, null,
            (source, result) => {
                try {
                    const activeConnection = source.add_and_activate_connection_finish(result);
                    if (!activeConnection)
                        throw new Error('NetworkManager did not return an active connection');
                    onStarted(activeConnection);
                } catch (error) {
                    onError(error);
                }
            },
        );
        return true;
    } catch (error) {
        onError(error);
        return false;
    }
}
