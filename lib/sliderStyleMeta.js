// Slider style metadata. Pure data — no gi typelibs — so it can be imported
// both by the shell process (lib/simpleSlider.js) and the GTK preferences
// process (prefs.js) that cannot load St/Clutter.
export const SLIDER_STYLES = [
    {id: 'classic', label: 'Classic capsule', tier: 'Default',
        desc: 'The original tall pill track with a floating knob.'},
    {id: 'arc', label: 'Arc ring dial', tier: 'Cairo',
        desc: 'A rotary dial drawn with Cairo; drag around the ring, scroll to nudge.'},
    {id: 'rails', label: 'Vertical twin rails', tier: 'St',
        desc: 'A vertical rail with fill and knob; icon and value stay in the row.'},
    {id: 'meter', label: '16-bar LED meter', tier: 'St',
        desc: 'Segmented horizontal LED bars; value fills them left to right.'},
    {id: 'lightsaber', label: 'Lightsaber glow', tier: 'St',
        desc: 'Glowing plasma bar with a bright core and bloomy knob.'},
    {id: 'wavy', label: 'Wavy liquid fill', tier: 'Cairo',
        desc: 'Canvas-drawn wave surface that follows the cursor.'},
    {id: 'carved', label: 'Carved capsule', tier: 'St',
        desc: 'Inset groove with a sharply-carved knurled knob.'},
    {id: 'neon', label: 'Neon 0-point', tier: 'St',
        desc: 'Centred zero notch with a blooming neon fill.'},
    {id: 'vu', label: 'Live VU + target', tier: 'St',
        desc: 'Equalizer-style bars with a fixed white target line.'},
    {id: 'snap', label: 'Snap-step + reel', tier: 'St',
        desc: '10% detents with a floating reel bubble showing the value.'},
    {id: 'cursor', label: 'Dual-end cursor', tier: 'St',
        desc: 'Gradient fill with a luminous cursor and circular end caps.'},
];

export const SLIDER_STYLE_DEFAULT = 'classic';

export function isValidSliderStyle(id) {
    return SLIDER_STYLES.some(s => s.id === id);
}