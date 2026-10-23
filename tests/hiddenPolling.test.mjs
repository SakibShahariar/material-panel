import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const modules = await Promise.all(
    ['gpu', 'disk', 'battery'].map(async name => [
        name,
        await readFile(new URL(`../modules/${name}.js`, import.meta.url), 'utf8'),
    ])
);

test('GPU, disk, and battery polling skips hidden chips with closed popups', () => {
    for (const [name, source] of modules) {
        assert.ok(
            source.includes('if (!button.mapped && !menu.isOpen)'),
            `${name} periodic polling should pause while its chip is hidden`
        );
    }
});

test('manual refresh remains available when opening a module popup', () => {
    for (const [name, source] of modules) {
        assert.match(
            source,
            /button\.connect\('clicked',[\s\S]*?refresh\(\)/,
            `${name} should refresh on direct interaction`
        );
    }
});
