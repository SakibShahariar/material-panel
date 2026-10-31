import assert from 'node:assert/strict';
import test from 'node:test';
import {findBestAccessPoint, getAccessPointInfo} from '../modules/network.js';

const bytes = values => ({get_data: () => new Uint8Array(values)});
const accessPoint = (ssid, strength, flags = 0, wpa = 0, rsn = 0) => ({
    get_ssid: () => bytes(ssid),
    get_strength: () => strength,
    get_flags: () => flags,
    get_wpa_flags: () => wpa,
    get_rsn_flags: () => rsn,
});

test('saved wireless profiles match scanned access points by raw SSID bytes', () => {
    const saved = {get_setting_wireless: () => ({get_ssid: () => bytes([72, 111, 109, 101])})};
    const weak = accessPoint([72, 111, 109, 101], 24);
    const strong = accessPoint([72, 111, 109, 101], 82, 0, 1);
    const unrelated = accessPoint([71, 117, 101, 115, 116], 99);
    assert.equal(findBestAccessPoint(saved, [weak, unrelated, strong]), strong);
});

test('access point metadata exposes bounded signal and security state', () => {
    const info = getAccessPointInfo(accessPoint([87, 105, 70, 105], 140, 0, 1));
    assert.deepEqual(info, {ssid: 'WiFi', strength: 100, secure: true});
});

test('unmatched and hidden SSIDs do not produce a false saved-network match', () => {
    const saved = {get_setting_wireless: () => ({get_ssid: () => bytes([65, 66])})};
    assert.equal(findBestAccessPoint(saved, [accessPoint([65, 67], 70)]), null);
    assert.equal(findBestAccessPoint(saved, []), null);
});
