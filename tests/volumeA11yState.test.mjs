import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/volume.js', import.meta.url), 'utf8');

test('volume chip announces current percentage or muted state and uses consistent casing', () => {
    assert.ok(source.includes("setChipA11y(box, sink.is_muted ? 'Volume, muted'"));
    assert.ok(source.includes('Volume, ${pct}%'));
    assert.ok(source.includes("label.text = sink.is_muted ? 'Muted'"));
    assert.ok(!source.includes("? 'mute'"));
});

test('volume and mute changes continue to refresh the accessible name', () => {
    assert.ok(source.includes("sink.connect('notify::volume', update)"));
    assert.ok(source.includes("sink.connect('notify::is-muted', update)"));
    assert.ok(source.includes('key !== Clutter.KEY_Return'));
    assert.ok(source.includes('toggleMute();'));
});
