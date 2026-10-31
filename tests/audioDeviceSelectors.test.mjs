import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const helper = await readFile(new URL('../lib/audioDeviceSelectors.js', import.meta.url), 'utf8');
const quicksettings = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');
const end4 = await readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8');

test('shared audio selectors enumerate and switch default output and input streams', () => {
    assert.match(helper, /listStreams\('get_sinks'\)/);
    assert.match(helper, /listStreams\('get_sources'\)/);
    assert.match(helper, /control\[setter\]\(stream\)/);
    assert.match(helper, /'set_default_sink'/);
    assert.match(helper, /'set_default_source'/);
    assert.match(helper, /get_default_sink/);
    assert.match(helper, /get_default_source/);
});

test('audio selectors refresh when devices appear, disappear, or defaults change', () => {
    for (const signal of ['output-added', 'output-removed', 'default-sink-changed',
        'input-added', 'input-removed', 'default-source-changed']) {
        assert.ok(helper.includes(signal), `missing ${signal} handler`);
    }
    assert.match(helper, /control\.disconnect\(id\)/);
});

test('both Quick Settings implementations mount the shared audio selectors', () => {
    assert.match(quicksettings, /buildAudioDeviceSelectors\(getMixerControl\(\)\)/);
    assert.match(end4, /buildAudioDeviceSelectors\(getMixerControl\(\)\)/);
    assert.match(quicksettings, /audioSelectors\.destroy\(\)/);
    assert.match(end4, /audioSelectors\.destroy\(\)/);
});
