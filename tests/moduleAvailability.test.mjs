import assert from 'node:assert/strict';
import test from 'node:test';
import {getOptionalModuleDependencies} from '../lib/moduleAvailability.js';

test('GPU reports missing optional NVIDIA tooling without marking the module unavailable', () => {
    const [dependency] = getOptionalModuleDependencies('gpu', () => false);
    assert.equal(dependency.program, 'nvidia-smi');
    assert.equal(dependency.available, false);
    assert.match(dependency.installHint, /NVIDIA driver utilities/);
});

test('Quick Settings reports brightnessctl as an optional control dependency', () => {
    const [dependency] = getOptionalModuleDependencies('quicksettings', program => program === 'brightnessctl');
    assert.equal(dependency.available, true);
    assert.equal(dependency.impact, 'The brightness slider');
    assert.match(dependency.installHint, /other Quick Settings controls remain available/);
});

test('modules without optional external tools do not show a misleading missing dependency', () => {
    assert.deepEqual(getOptionalModuleDependencies('clock', () => false), []);
});
