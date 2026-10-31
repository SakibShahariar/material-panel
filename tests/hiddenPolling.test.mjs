import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const modules = await Promise.all(
    ['gpu', 'disk', 'battery', 'memory', 'cpu', 'networkSpeed'].map(async name => [
        name,
        await readFile(new URL(`../modules/${name}.js`, import.meta.url), 'utf8'),
    ])
);

test('system metric polling skips hidden chips with closed popups', () => {
    for (const [name, source] of modules) {
        assert.ok(
            source.includes('if (!button.mapped && !menu.isOpen)'),
            `${name} periodic polling should pause while its chip is hidden`
        );
    }
});

test('CPU periodic sampling pauses while its chip and popup are hidden', async () => {
    const cpu = await readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8');
    assert.match(
        cpu,
        /let timerId = GLib\.timeout_add_seconds\(GLib\.PRIORITY_DEFAULT, 2, \(\) => \{[\s\S]*?if \(!button\.mapped && !menu\.isOpen\)[\s\S]*?primed = false;[\s\S]*?prevCores = \[\];[\s\S]*?updateLabels\(\);/
    );
});

test('manual refresh remains available when opening directly refreshed module popups', () => {
    for (const name of ['gpu', 'disk', 'memory']) {
        const source = modules.find(([moduleName]) => moduleName === name)[1];
        assert.match(
            source,
            /button\.connect\('clicked',[\s\S]*?refresh\(\)/,
            `${name} should refresh on direct interaction`
        );
    }

    const battery = modules.find(([name]) => name === 'battery')[1];
    assert.match(
        battery,
        /menu\.connect\('open-state-changed',[\s\S]*?if \(open\)[\s\S]*?refresh\(\)/,
        'battery should refresh when its popup opens'
    );
});
