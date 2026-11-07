import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearQuickSettingsState,
    getQuickSettingsFavorites,
    getQuickSettingsSliderStyle,
    getQuickSettingsTileStyle,
    getQuickSettingsTiles,
    setQuickSettingsFavorites,
    setQuickSettingsSliderStyle,
    setQuickSettingsTileStyle,
    setQuickSettingsTiles,
} from '../lib/quickSettingsState.js';

test('Quick Settings styles and tile preferences preserve defaults and share configured values', () => {
    clearQuickSettingsState();
    assert.equal(getQuickSettingsSliderStyle(), 'classic');
    assert.equal(getQuickSettingsTileStyle(), 'classic');
    assert.equal(getQuickSettingsTiles(), null);
    assert.deepEqual(getQuickSettingsFavorites(), []);

    setQuickSettingsSliderStyle('arc');
    setQuickSettingsTileStyle('tonal');
    setQuickSettingsTiles(['wifi', 'bluetooth']);
    setQuickSettingsFavorites(['wifi']);
    assert.equal(getQuickSettingsSliderStyle(), 'arc');
    assert.equal(getQuickSettingsTileStyle(), 'tonal');
    assert.deepEqual(getQuickSettingsTiles(), ['wifi', 'bluetooth']);
    assert.deepEqual(getQuickSettingsFavorites(), ['wifi']);
});

test('Quick Settings state copies arrays and rejects malformed values', () => {
    const tiles = ['wifi'];
    const favorites = ['bluetooth'];
    setQuickSettingsTiles(tiles);
    setQuickSettingsFavorites(favorites);
    tiles.push('dark-mode');
    favorites.push('wifi');
    assert.deepEqual(getQuickSettingsTiles(), ['wifi']);
    assert.deepEqual(getQuickSettingsFavorites(), ['bluetooth']);
    const readTiles = getQuickSettingsTiles();
    readTiles.push('night-light');
    assert.deepEqual(getQuickSettingsTiles(), ['wifi']);
    setQuickSettingsTiles('wifi');
    setQuickSettingsFavorites('wifi');
    setQuickSettingsSliderStyle(null);
    setQuickSettingsTileStyle(5);
    assert.equal(getQuickSettingsTiles(), null);
    assert.deepEqual(getQuickSettingsFavorites(), []);
    assert.equal(getQuickSettingsSliderStyle(), 'classic');
    assert.equal(getQuickSettingsTileStyle(), 'classic');
});

test('Quick Settings state resets to defaults on extension teardown', () => {
    setQuickSettingsSliderStyle('arc');
    setQuickSettingsTileStyle('tonal');
    setQuickSettingsTiles(['wifi']);
    setQuickSettingsFavorites(['wifi']);
    clearQuickSettingsState();
    assert.equal(getQuickSettingsSliderStyle(), 'classic');
    assert.equal(getQuickSettingsTileStyle(), 'classic');
    assert.equal(getQuickSettingsTiles(), null);
    assert.deepEqual(getQuickSettingsFavorites(), []);
});
