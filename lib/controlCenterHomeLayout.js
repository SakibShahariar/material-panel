const VALID_SIZES = new Set(['compact', 'half', 'full']);
const VALID_ID = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_RAW_ID_LENGTH = 128;
const MAX_RAW_SIZE_LENGTH = 16;

export const CONTROL_CENTER_HOME_CARD_DEFINITIONS = Object.freeze([
    Object.freeze({id: 'media', label: 'Now playing', defaultSize: 'full', sizes: Object.freeze(['full', 'half'])}),
    Object.freeze({id: 'actions', label: 'Quick actions', defaultSize: 'half', sizes: Object.freeze(['compact', 'half'])}),
    Object.freeze({id: 'wallpaper', label: 'Wallpaper', defaultSize: 'half', sizes: Object.freeze(['compact', 'half'])}),
    Object.freeze({id: 'weather', label: 'Weather', defaultSize: 'half', sizes: Object.freeze(['compact', 'half'])}),
    Object.freeze({id: 'system', label: 'System overview', defaultSize: 'half', sizes: Object.freeze(['half', 'full'])}),
    Object.freeze({id: 'calendar', label: 'Calendar', defaultSize: 'full', sizes: Object.freeze(['compact', 'half', 'full'])}),
]);

const DEFINITIONS_BY_ID = new Map(CONTROL_CENTER_HOME_CARD_DEFINITIONS.map(definition => [
    definition.id, definition,
]));

const FRAME_HORIZONTAL_PADDING = 24;
const NAVIGATION_GAP = 12;
const PAGE_HORIZONTAL_PADDING = 12;
const REGULAR_NAVIGATION_WIDTH = 112;
const COMPACT_NAVIGATION_WIDTH = 76;
const MIN_TWO_COLUMN_CONTENT_WIDTH = 340;

/**
 * Choose navigation and card-grid modes from the width left for actual content,
 * not the outer popup width. The navigation rail and frame padding otherwise
 * leave narrow popups with two unusably small card columns.
 */
export function getControlCenterHomeLayoutMode(popupWidth) {
    const width = Number.isFinite(popupWidth) ? Math.max(240, popupWidth) : 520;
    const contentWidth = navigationWidth =>
        Math.max(0, width - FRAME_HORIZONTAL_PADDING - NAVIGATION_GAP -
            PAGE_HORIZONTAL_PADDING - navigationWidth);
    const compactNavigation = contentWidth(REGULAR_NAVIGATION_WIDTH) < MIN_TWO_COLUMN_CONTENT_WIDTH;
    const availableContentWidth = contentWidth(
        compactNavigation ? COMPACT_NAVIGATION_WIDTH : REGULAR_NAVIGATION_WIDTH);
    return {
        compactNavigation,
        singleColumn: availableContentWidth < MIN_TWO_COLUMN_CONTENT_WIDTH,
        contentWidth: availableContentWidth,
    };
}

export const DEFAULT_CONTROL_CENTER_HOME_LAYOUT = Object.freeze({
    cards: Object.freeze([
        Object.freeze({id: 'media', visible: true, size: 'full'}),
        Object.freeze({id: 'actions', visible: true, size: 'half'}),
        Object.freeze({id: 'wallpaper', visible: true, size: 'half'}),
        Object.freeze({id: 'weather', visible: true, size: 'half'}),
        Object.freeze({id: 'system', visible: true, size: 'half'}),
        Object.freeze({id: 'calendar', visible: true, size: 'full'}),
    ]),
});

function legacyVisible(id, legacyVisibility) {
    if (id === 'weather' || id === 'calendar')
        return legacyVisibility?.[id] !== false;
    return true;
}

/**
 * Normalize a saved Home layout without discarding unknown card IDs.
 * Keeping unknown entries preserves their order and settings if a card is
 * temporarily unavailable or becomes available in a later extension version.
 */
export function normalizeControlCenterHomeLayout(value, legacyVisibility = null) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const input = Array.isArray(source.cards) ? source.cards : [];
    const cards = [];
    const seen = new Set();

    for (const item of input.slice(0, 32)) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
            item.id.length > MAX_RAW_ID_LENGTH)
            continue;
        const id = item.id.trim();
        if (!VALID_ID.test(id) || seen.has(id))
            continue;
        seen.add(id);
        const definition = DEFINITIONS_BY_ID.get(id);
        const rawSize = typeof item.size === 'string' && item.size.length <= MAX_RAW_SIZE_LENGTH
            ? item.size
            : '';
        const size = definition
            ? (definition.sizes.includes(rawSize) ? rawSize : definition.defaultSize)
            : (VALID_SIZES.has(rawSize) ? rawSize : 'half');
        cards.push({
            id,
            visible: typeof item.visible === 'boolean' ? item.visible : legacyVisible(id, legacyVisibility),
            size,
        });
    }

    for (const definition of CONTROL_CENTER_HOME_CARD_DEFINITIONS) {
        if (seen.has(definition.id))
            continue;
        cards.push({
            id: definition.id,
            visible: legacyVisible(definition.id, legacyVisibility),
            size: definition.defaultSize,
        });
    }

    return {cards};
}

export function setControlCenterHomeCard(layout, id, changes = {}) {
    const normalized = normalizeControlCenterHomeLayout(layout);
    if (typeof id !== 'string' || id.length > 64 || !VALID_ID.test(id))
        return normalized;
    const index = normalized.cards.findIndex(card => card.id === id);
    if (index < 0 || !changes || typeof changes !== 'object')
        return normalized;

    const definition = DEFINITIONS_BY_ID.get(id);
    const cards = normalized.cards.map(card => ({...card}));
    if (typeof changes.visible === 'boolean')
        cards[index].visible = changes.visible;
    if (typeof changes.size === 'string' && changes.size.length <= MAX_RAW_SIZE_LENGTH &&
        (definition ? definition.sizes.includes(changes.size) : VALID_SIZES.has(changes.size)))
        cards[index].size = changes.size;
    return normalizeControlCenterHomeLayout({cards});
}

export function moveControlCenterHomeCard(layout, id, offset) {
    const normalized = normalizeControlCenterHomeLayout(layout);
    if (typeof id !== 'string' || id.length > 64 || !VALID_ID.test(id))
        return normalized;
    const from = normalized.cards.findIndex(card => card.id === id);
    const delta = Number.isFinite(offset) ? Math.trunc(offset) : 0;
    const to = from + delta;
    if (from < 0 || delta === 0 || to < 0 || to >= normalized.cards.length)
        return normalized;

    const cards = normalized.cards.map(card => ({...card}));
    const [moved] = cards.splice(from, 1);
    cards.splice(to, 0, moved);
    return {cards};
}

/** Return visible, available card placements for a two-column responsive grid. */
export function getControlCenterHomeGridPlacements(layout, availableIds, compact = false) {
    const available = new Set(Array.isArray(availableIds) ? availableIds : []);
    const cards = normalizeControlCenterHomeLayout(layout).cards
        .filter(card => card.visible && available.has(card.id));
    if (compact) {
        return cards.map((card, row) => ({
            id: card.id, row, column: 0, columnSpan: 1, size: card.size,
        }));
    }

    const placements = [];
    let row = 0;
    let column = 0;
    for (const card of cards) {
        const columnSpan = card.size === 'full' ? 2 : 1;
        if (columnSpan === 2 && column !== 0) {
            row++;
            column = 0;
        }
        if (column + columnSpan > 2) {
            row++;
            column = 0;
        }
        placements.push({id: card.id, row, column, columnSpan, size: card.size});
        column += columnSpan;
        if (column === 2) {
            row++;
            column = 0;
        }
    }
    return placements;
}
