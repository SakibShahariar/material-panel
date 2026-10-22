/**
 * Pure helpers for mapping PulseAudio Bluetooth cards to BlueZ devices.
 * pactl output is requested with LC_ALL=C by the caller so profile labels
 * remain parseable regardless of the user's desktop language.
 */
function normalizeAddress(value) {
    const normalized = String(value ?? '').replace(/[^a-f0-9]/gi, '').toLowerCase();
    return normalized.length === 12 ? normalized : null;
}
function addressesInCard(block) {
    const addresses = [];
    for (const match of block.matchAll(/(?:api\.bluez5\.address|device\.string)\s*=\s*"([^"]+)"/gi))
        addresses.push(match[1]);
    for (const match of block.matchAll(/^\s*Name:\s*bluez_card\.([0-9a-f_:-]+)/gim))
        addresses.push(match[1].replace(/_/g, ':'));
    return addresses;
}
function cardMatchesAddress(block, address) {
    const target = normalizeAddress(address);
    if (!target)
        return false;
    return addressesInCard(block).some(candidate => normalizeAddress(candidate) === target);
}
/** Return a human-readable codec/profile label for the exact BlueZ MAC. */
export function codecFromPactlText(text, deviceAddress) {
    if (!normalizeAddress(deviceAddress))
        return null;
    for (const block of String(text ?? '').split(/^Card #/m)) {
        if (!/bluez/i.test(block) || !cardMatchesAddress(block, deviceAddress))
            continue;
        const match = block.match(/^\s*Active Profile:\s*(\S+)/im);
        if (!match)
            return null;
        const profile = match[1];
        if (/a2dp/i.test(profile))
            return 'High fidelity';
        if (/handsfree|headset|hfp|hsp/i.test(profile))
            return 'Headset + mic';
        return profile.replace(/_/g, ' ');
    }
    return null;
}
