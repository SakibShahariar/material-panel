import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [cpu, popup] = await Promise.all([
    readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/activityPopup.js', import.meta.url), 'utf8'),
]);

test('process snapshots are throttled and never rebuilt on every metric tick', () => {
    const start = cpu.indexOf('const refreshProcesses = () => {');
    const end = cpu.indexOf('\n    };', start);
    assert.ok(start >= 0 && end > start, 'refreshProcesses should be present');
    const refresh = cpu.slice(start, end);
    assert.match(refresh, /processLastRefresh >= 5 \* 1000 \* 1000/);
    assert.doesNotMatch(refresh, /renderProcesses\(\)/);
    assert.match(popup, /const renderProcesses = \(\) => \{/);
});

test('one CPU sample feeds both the chip and the popup', () => {
    assert.match(cpu, /latestMetricSample = \{\.\.\.data, temp\}/);
    assert.match(cpu, /if \(popup\.isOpen\) \{[\s\S]*?popup\.update\(\)/);
    assert.match(popup, /refreshId = GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, 1000/);
    assert.match(popup, /update\(\);/);
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
    assert.match(cpu, /coreClasses,/);
    assert.doesNotMatch(cpu, /_materialPanelCoreClasses/);
});

test('CPU-only chip mode avoids unnecessary memory snapshot reads', () => {
    assert.match(
        cpu,
        /const memSnap = \(metrics\.includes\('memory'\) \|\| popup\.isOpen\) \? readMemInfo\(\) : null;/,
        'memory should only be sampled when RAM is selected for the statistics chip or the popup is open'
    );
});
