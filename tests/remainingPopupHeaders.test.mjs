import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const paths = [
    'memory.js',
    'networkSpeed.js',
    'clipboardHistory.js',
    'quicksettingsEnd4.js',
];
const sources = await Promise.all(paths.map(path =>
    readFile(new URL('../modules/' + path, import.meta.url), 'utf8')));

test('remaining major popup surfaces use the shared title/status/action header', () => {
    for (const source of sources)
        assert.match(source, /import \{createPopupHeader\} from '\.\.\/lib\/popupHeader\.js';/);
    assert.match(sources[0], /body\.add_child\(header\)/);
    assert.match(sources[1], /statusActor: ifaceL/);
    assert.match(sources[2], /headerItem\.add_child\(header\)/);
    assert.match(sources[3], /createPopupHeader\(\{/);
});

test('Memory and Network Speed keep their existing metrics below the shared header', () => {
    assert.match(sources[0], /body\.add_child\(usedL\)[\s\S]*?body\.add_child\(swapL\)/);
    assert.match(sources[1], /body\.add_child\(downL\)[\s\S]*?body\.add_child\(upL\)[\s\S]*?body\.add_child\(sessL\)/);
});

test('Clipboard History keeps pause/resume and entry actions after its shared header', () => {
    assert.match(sources[2], /controller\.paused \? 'Resume recording' : 'Pause recording'/);
    assert.match(sources[2], /controller\.copyEntry\(entry\.id\)/);
});