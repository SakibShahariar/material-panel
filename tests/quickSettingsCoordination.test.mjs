import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {refreshQuickSettingsChrome, registerQuickSettingsRechrome} from '../lib/quickSettingsRechrome.js';

test('Quick Settings rechrome callback can be registered and unregistered', () => {
    let calls = 0;
    const unregister = registerQuickSettingsRechrome(() => calls++);
    refreshQuickSettingsChrome();
    assert.equal(calls, 1);
    unregister();
    refreshQuickSettingsChrome();
    assert.equal(calls, 1);
});

test('stale cleanup cannot unregister a newer Quick Settings popup callback', () => {
    let firstCalls = 0;
    let secondCalls = 0;
    const unregisterFirst = registerQuickSettingsRechrome(() => firstCalls++);
    registerQuickSettingsRechrome(() => secondCalls++);
    unregisterFirst();
    refreshQuickSettingsChrome();
    assert.equal(firstCalls, 0);
    assert.equal(secondCalls, 1);
});

test('Quick Settings expansion and rechrome coordination no longer use Shell globals', async () => {
    const [quickSettings, mediaPlayer] = await Promise.all([
        readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8'),
    ]);
    assert.match(quickSettings, /let qsExpandController = null/);
    assert.match(quickSettings, /registerQuickSettingsRechrome\(/);
    assert.match(quickSettings, /unregisterQuickSettingsRechrome\(\)/);
    assert.doesNotMatch(quickSettings, /_materialPanelQs(?:Expand|Rechrome)/);
    assert.match(mediaPlayer, /refreshQuickSettingsChrome\(\)/);
    assert.doesNotMatch(mediaPlayer, /_materialPanelQsRechrome/);
});
