/**
 * Read the native GNOME MessageTray actions exposed by a notification.
 * Action objects remain owned by MessageTray; callers must not mutate them.
 */

const MAX_ACTION_LABEL_LENGTH = 80;
const MAX_INLINE_ACTIONS = 3;

function normalizeActionLabel(value) {
    if (typeof value !== 'string')
        return '';

    // Normalize incrementally: native labels are app-provided and may be
    // enormous, so never create full-length sanitized or code-point arrays.
    const characters = [];
    let pendingSpace = false;
    let truncated = false;
    for (const character of value) {
        if (/[\\u0000-\\u001F\\u007F-\\u009F\\u00AD\\u034F\\u061C\\u200B-\\u200C\\u200E-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF]/u.test(character) ||
            /\\s/u.test(character)) {
            pendingSpace = characters.length > 0;
            continue;
        }

        if (pendingSpace) {
            characters.push(' ');
            pendingSpace = false;
        }
        characters.push(character);
        if (characters.length > MAX_ACTION_LABEL_LENGTH) {
            truncated = true;
            break;
        }
    }

    if (truncated)
        return characters.slice(0, MAX_ACTION_LABEL_LENGTH - 1).join('') + '…';
    return characters.join('');
}

export function getNotificationActions(notification, limit = 3) {
    if (!Number.isInteger(limit) || limit < 1)
        return [];
    limit = Math.min(limit, MAX_INLINE_ACTIONS);

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
            label = normalizeActionLabel(action.label);
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
