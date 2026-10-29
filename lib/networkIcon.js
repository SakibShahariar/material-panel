/** Choose a truthful chip icon for NetworkManager's primary connection type. */
export function networkIconForType(type, nm) {
    if (type === nm.SETTING_WIRELESS_SETTING_NAME)
        return 'network-wifi';
    if (type === nm.SETTING_WIRED_SETTING_NAME)
        return 'network-wired';
    if (type === nm.SETTING_VPN_SETTING_NAME)
        return 'network-up';
    if (type === nm.SETTING_GSM_SETTING_NAME || type === nm.SETTING_CDMA_SETTING_NAME)
        return 'phone';
    return 'network-up';
}
