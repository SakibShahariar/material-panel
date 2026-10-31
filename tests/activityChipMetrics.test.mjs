import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [config, cpu, gpu, network, prefs] = await Promise.all([
    readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/gpu.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/networkSpeed.js', import.meta.url), 'utf8'),
    readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
]);

test('system statistics chip validates selected metrics and display mode', () => {
    assert.match(config, /activityChipMetrics: \['cpu', 'temperature'\]/);
    assert.match(config, /activityChipMode: 'combined'/);
    assert.match(config, /validActivityMetrics\.includes\(metric\)/);
    assert.match(config, /merged\.activityChipMode = merged\.activityChipMode === 'cycle' \? 'cycle' : 'combined'/);
});

test('system statistics chip reuses existing GPU, network and memory samples', () => {
    assert.match(cpu, /readMemInfo\(\)/);
    assert.match(cpu, /_materialPanelGpuMetrics/);
    assert.match(cpu, /_materialPanelNetworkMetrics/);
    assert.match(gpu, /_materialPanelGpuMetrics = lastGpuInfo/);
    assert.match(network, /_materialPanelNetworkMetrics =/);
    assert.match(cpu, /activityCycleIndex\+\+ % values\.length/);
});

test('Preferences exposes metric selection and combined/cycling display', () => {
    for (const label of ['CPU usage', 'RAM usage', 'CPU temperature', 'GPU usage', 'Network transfer rate'])
        assert.ok(prefs.includes(label));
    assert.match(prefs, /Cycle through selected metrics/);
    assert.match(prefs, /activityModeRow\.set_selected/);
});
