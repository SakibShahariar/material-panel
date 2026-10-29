import assert from 'node:assert/strict';
import test from 'node:test';
import {networkIconForType} from '../lib/networkIcon.js';

const nm = {
    SETTING_WIRELESS_SETTING_NAME: '802-11-wireless',
    SETTING_WIRED_SETTING_NAME: '802-3-ethernet',
    SETTING_VPN_SETTING_NAME: 'vpn',
    SETTING_GSM_SETTING_NAME: 'gsm',
    SETTING_CDMA_SETTING_NAME: 'cdma',
};

test('maps Wi-Fi and wired connections to their existing icons', () => {
    assert.equal(networkIconForType('802-11-wireless', nm), 'network-wifi');
    assert.equal(networkIconForType('802-3-ethernet', nm), 'network-wired');
});

test('uses network and mobile icons for VPN, cellular, and unknown types', () => {
    assert.equal(networkIconForType('vpn', nm), 'network-up');
    assert.equal(networkIconForType('gsm', nm), 'phone');
    assert.equal(networkIconForType('cdma', nm), 'phone');
    assert.equal(networkIconForType('wireguard', nm), 'network-up');
});
