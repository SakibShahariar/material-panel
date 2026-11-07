/**
 * Shared, dependency-free Bluetooth device icon classification.
 * Accepts either BlueZ D-Bus variants or already-unpacked property values.
 */
function unpack(value) {
    try {
        return value?.deep_unpack?.() ?? value;
    } catch (e) {
        return value;
    }
}

export function getBluetoothDeviceIcon(props = {}, connected = false) {
    try {
        const icon = String(unpack(props.Icon) ?? '').toLowerCase();
        const name = String(unpack(props.Alias) ?? unpack(props.Name) ?? '').toLowerCase();
        const cls = Number(unpack(props.Class) ?? 0);

        if (icon.includes('audio-headset') || icon.includes('headset') ||
            icon.includes('audio-headphones') || icon.includes('headphone') ||
            icon.includes('audio-card') || icon.includes('speaker'))
            return 'headphones';
        if (icon.includes('input-keyboard') || icon.includes('keyboard'))
            return 'keyboard';
        if (icon.includes('input-mouse') || icon.includes('mouse'))
            return 'mouse';
        if (icon.includes('input-gaming') || icon.includes('joystick') || icon.includes('gamepad'))
            return 'gamepad';
        if (icon.includes('phone') || icon.includes('smartphone'))
            return 'phone';
        if (icon.includes('computer') || icon.includes('laptop'))
            return 'computer';

        if (/headphone|headset|buds|airpod|earbud|earphone|speaker|soundbar/.test(name))
            return 'headphones';
        if (/keyboard|keychron/.test(name))
            return 'keyboard';
        if (/mouse|trackball|trackpad/.test(name))
            return 'mouse';
        if (/computer|laptop|notebook|desktop/.test(name))
            return 'computer';
        if (/gamepad|game controller|controller|joystick/.test(name))
            return 'gamepad';

        const major = (cls >> 8) & 0x1f;
        if (major === 0x04)
            return 'headphones';
        if (major === 0x01)
            return 'computer';
        if (major === 0x02)
            return 'phone';
        if (major === 0x05) {
            const minor = (cls >> 2) & 0x3f;
            if (minor & 0x20)
                return 'mouse';
            if (minor & 0x10)
                return 'keyboard';
            if (minor === 0x04 || minor === 0x08)
                return 'gamepad';
            return 'keyboard';
        }
    } catch (e) {}
    return connected ? 'bluetooth-on' : 'bluetooth-off';
}
