/**
 * Read the native GNOME MessageTray actions exposed by a notification.
 * Action objects remain owned by MessageTray; callers must not mutate them.
 */
export function getNotificationActions(notification, limit = 3) {
    if (!Number.isInteger(limit) || limit < 1)
        return [];

    let actions;
    try {
        actions = notification?.actions;
    } catch (error) {
        return [];
    }
    if (!Array.isArray(actions))
        return [];

    const result = [];
    const seen = new Set();
    for (const action of actions) {
        if (!action || seen.has(action) || typeof action.activate !== 'function')
            continue;

        let label = '';
        try {
            label = typeof action.label === 'string' ? action.label.trim() : '';
        } catch (error) {}
        if (!label)
            continue;

        seen.add(action);
        result.push({action, label});
        if (result.length >= limit)
            break;
    }
    return result;
}

/**
 * Invoke only an action still owned by a notification that is still present.
 * The current-notification predicate is injected so this helper stays pure
 * and can be tested without GNOME Shell.
 */
export function activateNotificationAction(notification, action, isCurrent, onError) {
    try {
        if (!notification || typeof isCurrent !== 'function' || !isCurrent(notification))
            return false;

        const actions = notification.actions;
        if (!Array.isArray(actions) || !actions.includes(action) ||
            typeof action?.activate !== 'function')
            return false;

        action.activate();
        return true;
    } catch (error) {
        try { onError?.(error); } catch (callbackError) {}
        return false;
    }
}
