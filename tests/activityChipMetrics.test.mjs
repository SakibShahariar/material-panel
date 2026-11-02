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
    assert.match(cpu, /getGpuMetrics\(\)/);
    assert.match(cpu, /getNetworkMetrics\(\)/);
    assert.match(gpu, /setGpuMetrics\(\{/);
    assert.match(gpu, /clearGpuMetrics\(\)/);
    assert.match(network, /setNetworkMetrics\(\{/);
    assert.match(network, /clearNetworkMetrics\(\)/);
    for (const source of [cpu, gpu, network])
        assert.doesNotMatch(source, /_materialPanel(?:Gpu|Network)Metrics/);
    assert.match(cpu, /activityCycleIndex\+\+ % values\.length/);
    assert.match(cpu, /activityMetrics = Array\.isArray\(c\.activityChipMetrics\)/);
    assert.match(cpu, /activityMode = c\.activityChipMode === 'cycle' \? 'cycle' : 'combined'/);
    assert.doesNotMatch(cpu, /_materialPanelActivity(?:Chip|Metrics|Mode)/);
    assert.match(cpu, /freshGpu && gpu\.util >= 90/);
});

test('Preferences exposes metric selection and combined/cycling display', () => {
    for (const label of ['CPU usage', 'RAM usage', 'CPU temperature', 'GPU usage', 'Network transfer rate'])
        assert.ok(prefs.includes(label));
    assert.match(prefs, /Cycle through selected metrics/);
    assert.match(prefs, /activityModeRow\.set_selected/);
});
