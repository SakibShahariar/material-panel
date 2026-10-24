import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const cpu = await readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8');

test('expanded CPU popup does not rebuild process rows on every metric tick', () => {
    const start = cpu.indexOf('const refreshExtra = () => {');
    const end = cpu.indexOf('\n    };', start);
    assert.ok(start >= 0 && end > start, 'refreshExtra should be present');
    const refreshExtra = cpu.slice(start, end);
    assert.doesNotMatch(
        refreshExtra,
        /renderProcesses\(\)/,
        'periodic metric refresh should not destroy and recreate unchanged process rows'
    );
    assert.match(
        cpu,
        /if \(expanded\) \{\s*renderProcesses\(\);\s*refreshExtra\(\);\s*\}/,
        'opening the expanded section should still render its initial process state'
    );
    assert.match(cpu, /procSort = 'cpu'; renderProcesses\(\)/);
    assert.match(cpu, /procSort = 'mem'; renderProcesses\(\)/);
});

test('one CPU sample feeds both the chip and the one-second popup refresh', () => {
    assert.match(cpu, /latestMetricSample = \{\.\.\.data, temp\}/);
    assert.match(cpu, /refreshPopup\(latestMetricSample\)/);
    assert.doesNotMatch(
        cpu,
        /fastTimerId = GLib\.timeout_add\([\s\S]{0,500}?refreshPopup\(\)/,
        'the popup timer must not trigger a second independent CPU/sysfs sample'
    );
});


test('CPU temperature sampling reuses the discovered hwmon sensor path', () => {
    assert.match(cpu, /let cachedHwmonTempPath = null;/);
    assert.match(
        cpu,
        /if \(cachedHwmonTempPath\) \{\s*const temp = readTemp\(cachedHwmonTempPath\);\s*if \(temp !== null\)\s*return temp;/,
        'a valid cached sensor should be read directly without re-enumerating hwmon'
    );
    assert.match(
        cpu,
        /cachedHwmonTempPath = tempPath;/,
        'successful sensor discovery should cache the path'
    );
});

test('CPU core topology metadata is cached across popup refreshes', () => {
    assert.match(cpu, /let coreClassesRead = false;/);
    assert.match(
        cpu,
        /function getCoreClasses\(\) \{\s*if \(!coreClassesRead\) \{\s*cachedCoreClasses = readCoreClasses\(\);\s*coreClassesRead = true;/,
        'sysfs topology discovery should happen only once per module lifetime'
    );
    assert.match(cpu, /const cc = getCoreClasses\(\);/);
    assert.doesNotMatch(cpu, /const cc = readCoreClasses\(\);/);
});

test('CPU-only chip mode avoids unnecessary memory snapshot reads', () => {
    assert.match(
        cpu,
        /const memSnap = mode === 'cpu' \? null : readMemInfo\(\);/,
        'memory should only be sampled for RAM-bearing chip modes'
    );
});
