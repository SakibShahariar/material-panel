import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8');
const start = source.indexOf('function readTempHwmon()');
const end = source.indexOf('\nfunction ', start + 10);
const readTempHwmon = source.slice(start, end > start ? end : undefined);

test('CPU hwmon discovery negative results are rate-limited', () => {
    assert.match(source, /let lastHwmonDiscoveryAt = 0/);
    assert.match(source, /HWMON_RETRY_INTERVAL_US = 30 \* 1000000/);
    assert.match(readTempHwmon, /if \(now - lastHwmonDiscoveryAt < HWMON_RETRY_INTERVAL_US\)\s*return null;/);
    assert.match(readTempHwmon, /lastHwmonDiscoveryAt = now;/);
});

test('CPU temperature continues to use a readable cached hwmon path first', () => {
    assert.match(readTempHwmon, /if \(cachedHwmonTempPath\)\s*\{\s*const temp = readTemp\(cachedHwmonTempPath\);\s*if \(temp !== null\)\s*return temp;/);
});
