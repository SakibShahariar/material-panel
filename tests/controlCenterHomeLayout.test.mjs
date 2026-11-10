import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CONTROL_CENTER_HOME_CARD_DEFINITIONS,
    DEFAULT_CONTROL_CENTER_HOME_LAYOUT,
    getControlCenterHomeGridPlacements,
    moveControlCenterHomeCard,
    normalizeControlCenterHomeLayout,
    setControlCenterHomeCard,
} from '../lib/controlCenterHomeLayout.js';

test('default Home layout keeps a deliberate full-width media card and supported sizes', () => {
    const layout = normalizeControlCenterHomeLayout(DEFAULT_CONTROL_CENTER_HOME_LAYOUT);
    assert.equal(layout.cards[0].id, 'media');
    assert.equal(layout.cards[0].size, 'full');
    assert.equal(layout.cards.length, CONTROL_CENTER_HOME_CARD_DEFINITIONS.length);
    assert.ok(layout.cards.every(card => card.visible));
});

test('legacy Weather and Calendar visibility migrates into the new Home layout', () => {
    const layout = normalizeControlCenterHomeLayout(null, {weather: false, calendar: true});
    assert.equal(layout.cards.find(card => card.id === 'weather').visible, false);
    assert.equal(layout.cards.find(card => card.id === 'calendar').visible, true);
});

test('normalization removes duplicate and malformed entries but preserves unknown card placement', () => {
    const layout = normalizeControlCenterHomeLayout({cards: [
        {id: 'future-card', visible: false, size: 'full'},
        {id: 'weather', visible: false, size: 'full'},
        {id: 'weather', visible: true, size: 'compact'},
        {id: 'Bad ID', visible: true, size: 'half'},
        null,
    ]});
    assert.deepEqual(layout.cards.slice(0, 2), [
        {id: 'future-card', visible: false, size: 'full'},
        {id: 'weather', visible: false, size: 'half'},
    ]);
    assert.equal(layout.cards.some(card => card.id === 'Bad ID'), false);
});

test('hidden and unavailable cards keep their saved order and return when available', () => {
    const layout = normalizeControlCenterHomeLayout({cards: [
        {id: 'media', visible: true, size: 'full'},
        {id: 'future-card', visible: true, size: 'half'},
        {id: 'weather', visible: false, size: 'half'},
    ]});
    const placements = getControlCenterHomeGridPlacements(layout, ['media', 'weather'], false);
    assert.deepEqual(placements.map(item => item.id), ['media']);
    const restored = getControlCenterHomeGridPlacements(layout, ['media', 'future-card', 'weather'], false);
    assert.deepEqual(restored.map(item => item.id), ['media', 'future-card']);
    assert.equal(layout.cards[1].id, 'future-card');
});

test('card visibility, supported sizes and reordering update only the requested entry', () => {
    const layout = normalizeControlCenterHomeLayout(DEFAULT_CONTROL_CENTER_HOME_LAYOUT);
    const resized = setControlCenterHomeCard(layout, 'weather', {visible: false, size: 'compact'});
    assert.deepEqual(resized.cards.find(card => card.id === 'weather'), {
        id: 'weather', visible: false, size: 'compact',
    });
    const unsupported = setControlCenterHomeCard(layout, 'media', {size: 'compact'});
    assert.equal(unsupported.cards.find(card => card.id === 'media').size, 'full');
    const moved = moveControlCenterHomeCard(layout, 'calendar', -1);
    assert.equal(moved.cards.at(-2).id, 'calendar');
    assert.equal(layout.cards.at(-1).id, 'calendar');
});

test('grid placement packs half-width cards and gives full-width cards their own row', () => {
    const layout = normalizeControlCenterHomeLayout({cards: [
        {id: 'actions', visible: true, size: 'half'},
        {id: 'wallpaper', visible: true, size: 'half'},
        {id: 'media', visible: true, size: 'full'},
    ]});
    assert.deepEqual(getControlCenterHomeGridPlacements(layout, ['actions', 'wallpaper', 'media']), [
        {id: 'actions', row: 0, column: 0, columnSpan: 1, size: 'half'},
        {id: 'wallpaper', row: 0, column: 1, columnSpan: 1, size: 'half'},
        {id: 'media', row: 1, column: 0, columnSpan: 2, size: 'full'},
    ]);
    assert.deepEqual(getControlCenterHomeGridPlacements(layout, ['actions', 'wallpaper', 'media'], true)
        .map(item => [item.id, item.column, item.row, item.columnSpan]), [
        ['actions', 0, 0, 1],
        ['wallpaper', 0, 1, 1],
        ['media', 0, 2, 1],
    ]);
});
