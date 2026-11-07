/**
 * Accept only well-formed HTTPS event links. These URLs are passed directly
 * to Gio, never to a shell; reject shell metacharacters as an extra guard
 * against malformed or hostile calendar data.
 */
export function safeEventUrl(value) {
    if (typeof value !== 'string' || !value.trim())
        return null;
    const candidate = value.trim();
    if (/['"\x60;$(){}|<>\\\n\r]/.test(candidate))
        return null;
    try {
        const url = new URL(candidate);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
            return null;
        return url.href;
    } catch (e) {
        return null;
    }
}

