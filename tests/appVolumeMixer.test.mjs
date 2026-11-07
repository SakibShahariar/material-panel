import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const helper = await readFile(new URL('../lib/appVolumeMixer.js', import.meta.url), 'utf8');
const quicksettings = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');
const end4 = await readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8');
const ryoku = await readFile(new URL('../modules/quicksettingsRyoku.js', import.meta.url), 'utf8');

test('application mixer reads active Gvc sink inputs and exposes volume and mute controls', () => {
    assert.match(helper, /get_sink_inputs/);
    assert.match(helper, /PopupSliderMenuItem/);
    assert.match(helper, /PopupSwitchMenuItem/);
    assert.match(helper, /push_volume/);
    assert.match(helper, /change_is_muted/);
});

test('application mixer follows stream changes and releases stream/control signals', () => {
    for (const signal of ['stream-added', 'stream-removed', 'stream-changed', 'state-changed'])
        assert.ok(helper.includes(signal));
    assert.match(helper, /stream\.disconnect\(id\)/);
    assert.match(helper, /control\.disconnect\(id\)/);
});

test('all Quick Settings layouts mount and destroy the shared application mixer', () => {
    assert.equal((quicksettings.match(/buildAppVolumeMixer\(getMixerControl\(\)\)/g) || []).length, 2);
    assert.match(end4, /buildAppVolumeMixer\(getMixerControl\(\)\)/);
    assert.match(ryoku, /buildAppVolumeMixer\(getMixerControl\(\)\)/);
    for (const source of [quicksettings, end4, ryoku])
        assert.match(source, /appVolumeMixer\.destroy\(\)/);
});
