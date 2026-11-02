import assert from 'node:assert/strict';
import test from 'node:test';
import {clearLayoutStyle, getLayoutStyle, setLayoutStyle} from '../lib/layoutStyleState.js';

test('layout style defaults to the default layout and tracks configuration updates', () => {
    clearLayoutStyle();
    assert.equal(getLayoutStyle(), 'default');
    setLayoutStyle('end4');
    assert.equal(getLayoutStyle(), 'end4');
    setLayoutStyle('ryoku');
    assert.equal(getLayoutStyle(), 'ryoku');
});

test('layout style rejects malformed values and resets on extension teardown', () => {
    setLayoutStyle(null);
    assert.equal(getLayoutStyle(), 'default');
    setLayoutStyle('end4');
    clearLayoutStyle();
    assert.equal(getLayoutStyle(), 'default');
});
