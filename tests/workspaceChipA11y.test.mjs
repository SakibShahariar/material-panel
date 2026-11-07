import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/workspaces.js', import.meta.url), 'utf8');

test('default workspace buttons and empty End-4 dots have unique active-aware names', () => {
    assert.ok(source.includes('Workspace ${i + 1}, active'));
    assert.ok(source.includes('Workspace ${i + 1}'));
    assert.ok(source.includes('setChipA11y(btn'));
    assert.ok(source.includes('setChipA11y(dot'));
});

test('End-4 app clusters announce the workspace and visible app names', () => {
    assert.ok(source.includes('const appNames = apps.map'));
    assert.ok(source.includes('appNames.join'));
    assert.ok(source.includes('setChipA11y(btn, workspaceName)'));
    assert.ok(source.includes("active ? ', active'"));
});
