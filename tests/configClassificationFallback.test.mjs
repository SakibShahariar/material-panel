import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
const start = source.indexOf('this._configStore.watch(incomingConfig => {');
const end = source.indexOf('\n        });', start);
const watcher = source.slice(start, end);

test('config classification errors fall back to a full rebuild and refresh tray placements', () => {
    assert.match(watcher, /try \{\s*changedKeys = getChangedConfigKeys\(prev, newConfig\);\s*kind = classifyConfigChange\(prev, newConfig, changedKeys\);\s*\} catch \(e\)/);
    assert.match(watcher, /classificationFailed = true/);
    assert.match(watcher, /kind = 'unknown'/);
    assert.match(watcher, /classificationFailed \|\| !changedKeys/);
    assert.match(watcher, /_applyTrayOnly\(\)/);
    assert.match(watcher, /_schedulePanelRebuild\('config-classification-fallback'\)/);
});

test('malformed config values are normalized before classification', () => {
    assert.match(watcher, /incomingConfig && typeof incomingConfig === 'object'/);
    assert.match(watcher, /this\._config && typeof this\._config === 'object'/);
});
