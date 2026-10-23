import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [theme, stylesheet] = await Promise.all([
    readFile(new URL('../lib/theme.js', import.meta.url), 'utf8'),
    readFile(new URL('../stylesheet.css', import.meta.url), 'utf8'),
]);

test('defines one shared caption/body/title typography scale', () => {
    assert.match(theme, /TYPE_SCALE = Object\.freeze\(\{caption: 10\.5, body: 12, title: 14\}\)/);
    for (const [role, size] of [['caption', '10.5'], ['body', '12'], ['title', '14']]) {
        assert.ok(theme.includes(`TYPE_SCALE.${role}`), `generated theme uses ${role} token`);
        assert.ok(stylesheet.includes(`font-size: ${size}px;`), `fallback stylesheet defines ${role} size`);
    }
});

test('applies typography roles to Quick Settings labels in both theme paths', () => {
    for (const selector of [
        '.material-panel-qs-tile-label',
        '.material-panel-qs-profile-name',
        '.material-panel-qs-profile-sub',
        '.material-panel-qs-media-title',
        '.material-panel-qs-media-sub',
        '.material-panel-qs-bt-device-name',
        '.material-panel-qs-bt-device-status',
    ]) {
        assert.ok(theme.includes(selector), `generated theme styles ${selector}`);
        assert.ok(stylesheet.includes(selector), `fallback stylesheet styles ${selector}`);
    }
    // The user-configurable panel scale still controls bar-chip label sizes.
    assert.ok(theme.includes('font-size: ${labelFont}px;'));
});
