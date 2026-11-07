import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/audio.js', import.meta.url), 'utf8');

test('Gvc initialization failures permit rate-limited retries', () => {
    assert.match(source, /let _retryId = 0/);
    assert.match(source, /GLib\.timeout_add_seconds\(GLib\.PRIORITY_DEFAULT, 30/);
    assert.match(source, /_retryId = 0;\s*_openFailed = false;/);
    assert.match(source, /if \(!_retryId\)/);
});

test('audio teardown cancels retry timer and resets failure state', () => {
    assert.match(source, /export function closeMixerControl\(\)\s*\{[\s\S]*?GLib\.source_remove\(_retryId\)[\s\S]*?_openFailed = false;/);
});


test('a successful delayed Gvc retry notifies the extension to rebuild audio consumers', async () => {
    const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
    assert.match(source, /const control = getMixerControl\(\)/);
    assert.match(source, /_onMixerControlAvailable\?\.\(control\)/);
    assert.match(source, /export function setMixerControlReadyCallback\(callback\)/);
    assert.match(extension, /setMixerControlReadyCallback\(\(\) => this\._schedulePanelRebuild\('audio-recovered'\)\)/);
    assert.match(extension, /setMixerControlReadyCallback\(null\)/);
});
