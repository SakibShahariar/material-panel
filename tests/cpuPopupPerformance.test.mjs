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
