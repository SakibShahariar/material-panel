import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8');
const start = source.indexOf('function buildDualSliders(');
const end = source.indexOf('\n// ── Toggles', start);
const builder = source.slice(start, end);

test('End-4 brightness initialization does not synchronously spawn brightnessctl', () => {
    assert.doesNotMatch(builder, /spawn_command_line_sync\(['"]brightnessctl/);
    assert.match(builder, /initialValue: 0\.5/);
    assert.match(builder, /communicate_utf8_async\(/);
    assert.match(builder, /probeBrightness\(\['max'\]/);
    assert.match(builder, /probeBrightness\(\['get'\]/);
});

test('brightness slider updates asynchronously and ignores probes after teardown', () => {
    assert.match(builder, /briSlider\.setValue\(Math\.min\(1, Math\.max\(0\.01, currentBrightness \/ maxBrightness\)\)\)/);
    assert.match(builder, /if \(pendingBrightnessProbes !== 0 \|\| brightnessProbeCancelled\)/);
    assert.match(builder, /brightnessProbeCancelled = true/);
    assert.match(builder, /Gio\.Subprocess\.new\(/);
});
