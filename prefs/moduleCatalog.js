export const ZONE_NAMES = ['left', 'center', 'right'];
export const EXT_PREFIX = 'extension:';
export function extId(role) { return `${EXT_PREFIX}${role}`; }
export function roleFromExt(id) {
    return id.startsWith(EXT_PREFIX) ? id.slice(EXT_PREFIX.length) : null;
}
/** Keep preset.zones in sync with tray placement (option C). */
export function syncExtensionZone(config, role, placement) {
    const id = extId(role);
    const preset = config.presets?.[config.activePreset];
    if (!preset?.zones) return;
    for (const z of ZONE_NAMES) {
        const arr = preset.zones[z] ?? [];
        preset.zones[z] = arr.filter(x => x !== id);
    }
    if (placement === 'left' || placement === 'right' || placement === 'center') {
        if (!preset.zones[placement])
            preset.zones[placement] = [];
        if (!preset.zones[placement].includes(id))
            preset.zones[placement].push(id);
    }
}
export function friendlyRoleName(role) {
    // appindicatorsupport-chrome-status-icon-5 → chrome…
    let s = String(role);
    s = s.replace(/^appindicatorsupport-/, '');
    s = s.replace(/^appIndicator[:\-]?/i, '');
    s = s.replace(/-status-icon-\d+$/, '');
    s = s.replace(/[_-]+/g, ' ').trim();
    return s || role;
}

export const ALL_MODULES = [
    {id: 'activities', name: 'Activities', zone: 'left', requirement: 'GNOME Shell overview'},
    {id: 'focusedWindow', name: 'Focused Window', zone: 'left', requirement: 'Active-window information from GNOME Shell'},
    {id: 'btConnected', name: 'BT Connected Device', zone: 'left', requirement: 'BlueZ Bluetooth service and a connected device'},
    {id: 'workspaces', name: 'Workspaces', zone: 'left', requirement: 'GNOME Shell workspace API'},
    {id: 'cpu', name: 'CPU / Activity', zone: 'left', requirement: 'Linux /proc data; process details depend on system permissions'},
    {id: 'memory', name: 'Memory', zone: 'left', requirement: 'Linux /proc/meminfo'},
    {id: 'disk', name: 'Disk', zone: 'left', requirement: 'Mounted filesystems exposed through GIO'},
    {id: 'gpu', name: 'GPU', zone: 'left', requirement: 'Linux DRM information; NVIDIA usage details additionally use nvidia-smi when available'},
    {id: 'networkSpeed', name: 'Network Speed', zone: 'right', requirement: 'Linux /proc/net/dev'},
    {id: 'clock', name: 'Clock', zone: 'center', requirement: 'GNOME Shell and system time settings'},
    {id: 'weather', name: 'Weather', zone: 'center', requirement: 'GNOME Weather location or manual coordinates, plus internet access to Open-Meteo'},
    {id: 'notifications', name: 'Notifications', zone: 'center', requirement: 'GNOME Shell notification API'},
    {id: 'battery', name: 'Battery', zone: 'right', requirement: 'UPower and battery hardware; hidden on systems without a battery'},
    {id: 'volume', name: 'Volume', zone: 'right', requirement: 'Gvc audio mixer and an available audio service'},
    {id: 'network', name: 'Network', zone: 'right', requirement: 'NetworkManager; connection actions use saved network profiles'},
    {id: 'darkmode', name: 'Dark Mode', zone: 'right', requirement: 'GNOME color-scheme settings'},
    {id: 'nightlight', name: 'Night Light', zone: 'right', requirement: 'GNOME Night Light settings support'},
    {id: 'dnd', name: 'Do Not Disturb', zone: 'right', requirement: 'GNOME Shell notification controls'},
    {id: 'powermenu', name: 'Power Menu', zone: 'right', requirement: 'GNOME Shell session and power actions'},
    {id: 'bluetooth', name: 'Bluetooth', zone: 'right', requirement: 'BlueZ D-Bus service and Bluetooth adapter'},
    {id: 'media', name: 'Media', zone: 'right', requirement: 'A media player exposing MPRIS on the user session bus'},
    {id: 'quicksettings', name: 'Quick Settings', zone: 'right', requirement: 'GNOME Shell controls and the selected Quick Settings layout'},
];

