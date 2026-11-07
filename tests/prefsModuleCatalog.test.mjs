import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALL_MODULES, ZONE_NAMES, extId, roleFromExt, syncExtensionZone, friendlyRoleName,
} from '../prefs/moduleCatalog.js';

test('module catalog has unique identifiers and valid default zones', () => {
    const ids = ALL_MODULES.map(module => module.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const module of ALL_MODULES)
        assert.ok(ZONE_NAMES.includes(module.zone), `${module.id} has an invalid default zone`);
});

test('extension role helpers preserve the extension prefix contract', () => {
    assert.equal(extId('example-status-icon'), 'extension:example-status-icon');
    assert.equal(roleFromExt('extension:example-status-icon'), 'example-status-icon');
    assert.equal(roleFromExt('network'), null);
    assert.equal(friendlyRoleName('appindicatorsupport-chrome-status-icon-5'), 'chrome');
});

test('moving an extension role removes old placements before adding the new zone', () => {
    const config = {
        activePreset: 'default',
        presets: {
            default: {zones: {
                left: ['cpu', 'extension:sample'],
                center: ['clock', 'extension:sample'],
                right: ['volume'],
            }},
            end4: {zones: {left: ['extension:sample'], center: [], right: []}},
        },
    };
    syncExtensionZone(config, 'sample', 'right');
    assert.deepEqual(config.presets.default.zones, {
        left: ['cpu'], center: ['clock'], right: ['volume', 'extension:sample'],
    });
    assert.deepEqual(config.presets.end4.zones.left, ['extension:sample']);
});

test('hiding an extension role removes it from all active preset zones', () => {
    const config = {
        activePreset: 'default',
        presets: {default: {zones: {
            left: ['extension:sample'], center: [], right: ['extension:other'],
        }}},
    };
    syncExtensionZone(config, 'sample', 'hidden');
    assert.deepEqual(config.presets.default.zones, {
        left: [], center: [], right: ['extension:other'],
    });
});
