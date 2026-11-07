import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearProfileIdentityState,
    isProfileIdentityHidden,
    setProfileIdentityHidden,
} from '../lib/profileIdentityState.js';

test('profile identity preference is shared without globalThis', () => {
    setProfileIdentityHidden(true);
    assert.equal(isProfileIdentityHidden(), true);
    setProfileIdentityHidden(false);
    assert.equal(isProfileIdentityHidden(), false);
});

test('profile identity preference accepts only true and resets on teardown', () => {
    setProfileIdentityHidden('true');
    assert.equal(isProfileIdentityHidden(), false);
    setProfileIdentityHidden(true);
    clearProfileIdentityState();
    assert.equal(isProfileIdentityHidden(), false);
});
