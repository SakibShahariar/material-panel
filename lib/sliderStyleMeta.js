// Slider style metadata. Pure data — no gi typelibs — so it can be imported
// both by the shell process (lib/simpleSlider.js) and the GTK preferences
// process (prefs.js) that cannot load St/Clutter.
export const SLIDER_STYLES = [
    {id: 'classic', label: 'Classic capsule', tier: 'Default',
        desc: 'Original tall pill track with floating knob. Best fit for QS.',
        rowSafe: true},
    {id: 'meter', label: '16-bar LED meter', tier: 'St',
        desc: 'Segmented horizontal bars; value fills left to right.',
        rowSafe: true},
    {id: 'lightsaber', label: 'Lightsaber glow', tier: 'St',
        desc: 'Glowing plasma bar with bright core.',
        rowSafe: true},
    {id: 'carved', label: 'Carved capsule', tier: 'St',
        desc: 'Inset groove with knurled knob.',
        rowSafe: true},
    {id: 'neon', label: 'Neon 0-point', tier: 'St',
        desc: 'Centred zero notch with neon fill.',
        rowSafe: true},
    {id: 'cursor', label: 'Dual-end cursor', tier: 'St',
        desc: 'Gradient fill with luminous cursor.',
        rowSafe: true},
    {id: 'snap', label: 'Snap-step + reel', tier: 'St',
        desc: '10% detents with floating value reel.',
        rowSafe: true},
    {id: 'vu', label: 'Live VU + target', tier: 'St',
        desc: 'Equalizer-style bars with target line.',
        rowSafe: true},
    {id: 'wavy', label: 'Wavy liquid fill', tier: 'Cairo',
        desc: 'Canvas wave surface; falls back to classic if Cairo missing.',
        rowSafe: true},
    {id: 'rails', label: 'Vertical rails (tall)', tier: 'Experimental',
        desc: 'Vertical rail each for volume & brightness, shown side by side.',
        rowSafe: false},
    {id: 'arc', label: 'Arc ring dial (tall)', tier: 'Experimental',
        desc: 'Rotary dials for volume & brightness, shown side by side.',
        rowSafe: false},
];

export const SLIDER_STYLE_DEFAULT = 'classic';

export function isValidSliderStyle(id) {
    return SLIDER_STYLES.some(s => s.id === id);
}

export function isRowSafeSliderStyle(id) {
    const s = SLIDER_STYLES.find(x => x.id === id);
    return s ? !!s.rowSafe : true;
}

/** Styles that need a tall vertical-friendly row (not dual horizontal capsule). */
export function isTallSliderStyle(id) {
    return id === 'rails' || id === 'arc';
}
