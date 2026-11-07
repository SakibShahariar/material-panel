import assert from 'node:assert/strict';
import test from 'node:test';
import {clearSharedState} from '../lib/sharedState.js';

test('clearSharedState deletes Material Panel globals without touching unrelated properties', () => {
    const target = {
        _materialPanelLayoutStyle: 'default',
        _materialPanelWeatherLocation: {city: 'Dhaka'},
        unrelatedExtensionState: true,
    };

    clearSharedState(target);

    assert.deepEqual(Object.keys(target), ['unrelatedExtensionState']);
    assert.equal(Object.hasOwn(target, '_materialPanelLayoutStyle'), false);
    assert.equal(Object.hasOwn(target, '_materialPanelWeatherLocation'), false);
    assert.equal(target.unrelatedExtensionState, true);
});

test('clearSharedState does not delete inherited properties', () => {
    const target = Object.create({_materialPanelInherited: true});
    target._materialPanelOwn = true;

    clearSharedState(target);

    assert.equal(Object.hasOwn(target, '_materialPanelOwn'), false);
    assert.equal(target._materialPanelInherited, true);
});
