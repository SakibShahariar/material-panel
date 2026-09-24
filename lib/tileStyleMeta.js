// QS tile style metadata — pure data (shell + prefs).
export const TILE_STYLES = [
    // Tier 1 — pure CSS
    {id: 'classic', label: 'Classic pill', tier: 'Default',
        desc: 'Current solid primary fill when on.',
        layout: 'grid', extras: [], rowSafe: true},
    {id: 'minimal', label: 'Minimal outline', tier: 'CSS',
        desc: '1px outline; accent border + icon when on.',
        layout: 'grid', extras: [], rowSafe: true},
    {id: 'tonal', label: 'M3 tonal', tier: 'CSS',
        desc: 'Quiet surface; soft primary tint + primary icon when on.',
        layout: 'grid', extras: [], rowSafe: true},
    {id: 'graphite', label: 'Graphite', tier: 'CSS',
        desc: 'Dark bordered squares; solid primary when on.',
        layout: 'grid', extras: [], rowSafe: true},
    {id: 'glass', label: 'Tinted glass', tier: 'CSS',
        desc: 'Fake translucency via gradients.',
        layout: 'grid', extras: [], rowSafe: true},
    {id: 'indicator', label: 'Indicator underline', tier: 'Actor',
        desc: 'Quiet tile; bottom primary underline when on.',
        layout: 'grid', extras: ['underline'], rowSafe: true},
    // Tier 2–3
    {id: 'icon-top', label: 'Icon chip + label', tier: 'Geometry',
        desc: 'Icon in a circle, label below (taller tile).',
        layout: 'grid', extras: [], rowSafe: true},
    {id: 'icon-only', label: 'Icon-only circles', tier: 'Geometry',
        desc: 'Single row of floating icon circles.',
        layout: 'row', extras: [], rowSafe: false},
    {id: 'recessed', label: 'Recessed neon groove', tier: 'Actor',
        desc: 'Inset groove fills with primary when on.',
        layout: 'grid', extras: ['groove'], rowSafe: true},
    {id: 'eq', label: 'Equalizer', tier: 'Actor',
        desc: 'Living EQ bars when on.',
        layout: 'grid', extras: ['eq'], rowSafe: true},
    // Tier 4 / second batch
    {id: 'ambient', label: 'Ambient floats', tier: 'CSS',
        desc: 'Near-invisible surface; state on the icon.',
        layout: 'grid', extras: [], rowSafe: true},
    {id: 'aurora', label: 'Aurora border', tier: 'CSS',
        desc: 'Gradient border glow when on.',
        layout: 'grid', extras: [], rowSafe: true},
    {id: 'squiggle', label: 'Glossy squiggle', tier: 'CSS',
        desc: 'Soft blob corners and gloss highlight.',
        layout: 'grid', extras: [], rowSafe: true},
    {id: 'donut', label: 'Donut ring', tier: 'Actor',
        desc: 'Halo around the icon when on.',
        layout: 'grid', extras: ['ring'], rowSafe: true},
    {id: 'dotmatrix', label: 'Dot matrix', tier: 'Actor',
        desc: 'Six cells light when on.',
        layout: 'grid', extras: ['dots'], rowSafe: true},
    {id: 'spotlight', label: 'Spotlight', tier: 'Motion',
        desc: 'Soft radial hover (CSS approximation).',
        layout: 'grid', extras: [], rowSafe: true},
];

export const TILE_STYLE_DEFAULT = 'classic';

export function isValidTileStyle(id) {
    return TILE_STYLES.some(s => s.id === id);
}

export function tileStyleMeta(id) {
    return TILE_STYLES.find(s => s.id === id) || TILE_STYLES[0];
}
