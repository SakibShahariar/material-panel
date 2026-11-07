export function notificationAppNames(items) {
    return [...new Set((items || [])
        .map(item => String(item?.appName || '').trim())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
}

export function hasUnreadNotificationState(items) {
    return (items || []).some(item => typeof item?.unread === 'boolean');
}

export function filterNotifications(items, {query = '', appName = null, unreadOnly = false} = {}) {
    const needle = String(query || '').trim().toLowerCase();
    return (items || []).filter(item => {
        if (appName && item?.appName !== appName)
            return false;
        if (unreadOnly && item?.unread !== true)
            return false;
        if (!needle)
            return true;
        return [item?.title, item?.body, item?.appName]
            .some(value => String(value || '').toLowerCase().includes(needle));
    });
}

export function groupNotificationsByApp(items) {
    const groups = new Map();
    for (const item of items || []) {
        const appName = String(item?.appName || 'System');
        if (!groups.has(appName))
            groups.set(appName, []);
        groups.get(appName).push(item);
    }
    return [...groups].map(([appName, notifications]) => ({
        appName,
        items: notifications,
    }));
}
