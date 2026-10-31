function bytesOf(value) {
    if (value == null)
        return null;
    if (typeof value.get_data === 'function') {
        try { return bytesOf(value.get_data()); } catch (e) { return null; }
    }
    if (Array.isArray(value) && value.length === 2 &&
        (ArrayBuffer.isView(value[0]) || Array.isArray(value[0])))
        return bytesOf(value[0]);
    if (ArrayBuffer.isView(value) || Array.isArray(value))
        return Array.from(value, byte => Number(byte) & 0xff);
    return null;
}

export function ssidKey(value) {
    const bytes = bytesOf(value);
    return bytes && bytes.length ? bytes.join(',') : null;
}

export function getAccessPointInfo(accessPoint) {
    if (!accessPoint)
        return null;
    let ssid = '';
    let strength = 0;
    let secure = false;
    try {
        const bytes = bytesOf(accessPoint.get_ssid?.());
        if (bytes)
            ssid = new TextDecoder('utf-8').decode(new Uint8Array(bytes)).replace(/\0/g, '�');
    } catch (e) {}
    try {
        strength = Math.max(0, Math.min(100, Number(accessPoint.get_strength?.()) || 0));
    } catch (e) {}
    try {
        const flags = Number(accessPoint.get_flags?.()) || 0;
        const wpa = Number(accessPoint.get_wpa_flags?.()) || 0;
        const rsn = Number(accessPoint.get_rsn_flags?.()) || 0;
        secure = Boolean((flags & 1) || wpa || rsn);
    } catch (e) {}
    return {ssid, strength, secure};
}

export function findBestAccessPoint(connection, accessPoints) {
    let target = null;
    try {
        target = ssidKey(connection.get_setting_wireless?.()?.get_ssid?.());
    } catch (e) {}
    if (!target)
        return null;
    let best = null;
    let bestStrength = -1;
    for (const accessPoint of Array.isArray(accessPoints) ? accessPoints : []) {
        let key = null;
        try { key = ssidKey(accessPoint.get_ssid?.()); } catch (e) {}
        if (key !== target)
            continue;
        const info = getAccessPointInfo(accessPoint);
        if (info && info.strength > bestStrength) {
            best = accessPoint;
            bestStrength = info.strength;
        }
    }
    return best;
}
