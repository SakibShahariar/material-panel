import assert from 'node:assert/strict';
import test from 'node:test';
import {codecFromPactlText} from '../lib/bluetoothCodec.js';

const firstCard = `Card #1
    Name: bluez_card.AA_BB_CC_DD_EE_FF
    Properties:
        device.string = "AA:BB:CC:DD:EE:FF"
        api.bluez5.address = "AA:BB:CC:DD:EE:FF"
    Active Profile: a2dp-sink
`;
const secondCard = `Card #2
    Name: bluez_card.11_22_33_44_55_66
    Properties:
        api.bluez5.address = "11:22:33:44:55:66"
    Active Profile: headset-head-unit
`;

test('maps A2DP profile to the exact BlueZ MAC address', () => {
    assert.equal(codecFromPactlText(firstCard, 'aa:bb:cc:dd:ee:ff'), 'High fidelity');
    assert.equal(codecFromPactlText(firstCard, 'AA_BB_CC_DD_EE_FF'), 'High fidelity');
});
test('does not confuse another device profile or an unmatched MAC', () => {
    assert.equal(codecFromPactlText(firstCard + secondCard, '11:22:33:44:55:66'), 'Headset + mic');
    assert.equal(codecFromPactlText(firstCard + secondCard, '22:33:44:55:66:77'), null);
});
test('supports a BlueZ card-name MAC when address properties are absent', () => {
    assert.equal(codecFromPactlText('Card #4\n Name: bluez_card.AA_BB_CC_DD_EE_FF\n Active Profile: a2dp-sink', 'AA:BB:CC:DD:EE:FF'), 'High fidelity');
});
test('returns no codec when the address is missing or invalid', () => {
    assert.equal(codecFromPactlText(firstCard, ''), null);
    assert.equal(codecFromPactlText(firstCard, 'headphones'), null);
    assert.equal(codecFromPactlText(firstCard, '00:00:00:00:00:00'), null);
});
test('handles other active profiles', () => {
    assert.equal(codecFromPactlText(firstCard.replace('a2dp-sink', 'off'), 'AA:BB:CC:DD:EE:FF'), 'off');
});
