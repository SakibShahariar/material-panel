import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('media popup uses the shared leading-art, title and artist hierarchy', async () => {
    const source = await readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8');
    assert.match(source, /createPopupHeader\(/);
    assert.match(source, /titleActor: pTitle/);
    assert.match(source, /statusActor: pArtist/);
    assert.match(source, /leadingActor: art/);
    assert.match(source, /body\.add_child\(header\)/);
});
