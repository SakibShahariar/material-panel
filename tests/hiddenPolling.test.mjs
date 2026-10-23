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

test('manual refresh remains available when opening directly refreshed module popups', () => {
    for (const name of ['gpu', 'disk', 'battery', 'memory']) {
        const source = modules.find(([moduleName]) => moduleName === name)[1];
        assert.match(
            source,
            /button\.connect\('clicked',[\s\S]*?refresh\(\)/,
            `${name} should refresh on direct interaction`
        );
    }
});
