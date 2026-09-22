import Atk from 'gi://Atk';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Cairo from 'gi://cairo';
import {isValidSliderStyle} from './sliderStyleMeta.js';

// Configurable Quick-Settings slider.
// 'classic' keeps the original tall pill; the other styles are the A–J
// concepts from the research round, all driven by one shared drag core
// (stage captured-event drag, throttle, keyboard, scroll, a11y).
const DEFAULT_TRACK_WIDTH = 200;
const EMIT_THROTTLE_MS = 80;

const clamp01 = v => Math.max(0, Math.min(1, v));
const pct = v => `${Math.round(v * 100)}%`;

function primary() {
    return globalThis._materialPanelPrimary ?? '#89b4fa';
}
function onAccent() {
    return globalThis._materialPanelOnPrimary ?? '#1e1e2e';
}
/** QS translucent surface (may be rgba). */
function surface() {
    return globalThis._materialPanelQsSurface ?? 'rgba(49, 50, 68, 0.55)';
}
/** Solid surface hex for gradients / Cairo. */
function surfaceSolid() {
    return globalThis._materialPanelSurface ?? '#1e1e2e';
}
function textColor() {
    return globalThis._materialPanelOnSurface ?? '#cdd6f4';
}
function secondary() {
    return globalThis._materialPanelSecondary ?? '#a6e3a1';
}
function tertiary() {
    return globalThis._materialPanelTertiary ?? '#89b4fa';
}
/** Unfilled track — on_surface at low alpha (works on dark and light). */
function trackBg(a = 0.22) {
    return rgba(textColor(), a);
}
function trackQuiet(a = 0.12) {
    return rgba(textColor(), a);
}
function outlineSoft(a = 0.35) {
    return rgba(textColor(), a);
}
function dropShadow(a = 0.4) {
    // Depth from on_surface (not pure black) so light themes stay coherent
    return rgba(textColor(), a * 0.55);
}
// Volume/brightness accent used by the non-classic styles.
function sideAccent(which) {
    if (which === 'brightness')
        return tertiary();
    if (which === 'volume')
        return secondary();
    return primary();
}

function css(a, s) {
    try { a.style = s; } catch (e) {}
}
function setPos(a, x, y) {
    try { a.set_position(Math.round(x), Math.round(y)); } catch (e) {}
}
function hexRgb(hex) {
    let h = String(hex ?? '#ffffff').replace('#', '');
    if (h.length === 3)
        h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgba(hex, a) {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}
function mk(host, w, h) {
    const a = new St.Widget({});
    try { a.width = w; a.height = h; } catch (e) {}
    host.add_child(a);
    return a;
}
function mkLab(host, text) {
    const l = new St.Label({text: text || ''});
    host.add_child(l);
    return l;
}
function cRounded(cr, x, y, w, h, r) {
    cr.moveTo(x + r, y);
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    cr.close_path();
}
const TWO_PI = Math.PI * 2;

// Track axis helpers
function xR(actor, W, event) {
    const [ax] = actor.get_transformed_position();
    const [ex] = event.get_coords();
    return (ex - ax) / W;
}
function yR(actor, H, event) {
    const [, ay] = actor.get_transformed_position();
    const [, ey] = event.get_coords();
    return 1 - (ey - ay) / H;
}

// ————————————————————————————————————————————————————————
//  Builder: classic pill (original look)
// ————————————————————————————————————————————————————————
function styleClassic(brush, container) {
    const W = brush.width, H = 28, K = 22;
    container.width = W;
    container.height = H;
    css(container, `width: ${W}px; height: ${H}px;`);

    const track = mk(container, W, H);
    track.style_class = 'material-panel-simple-slider-track';
    css(track, `width: ${W}px; height: ${H}px; background-color: ${trackBg(0.22)}; border-radius: 999px;`);
    const fill = mk(container, K, H);
    fill.style_class = 'material-panel-simple-slider-fill';
    const knob = mk(container, K, K);
    knob.style_class = 'material-panel-simple-slider-knob';

    const paint = () => {
        css(fill, `height: ${H}px; background-color: ${brush.accent()}; border-radius: 999px;`);
        css(knob, `width: ${K}px; height: ${K}px; background-color: ${onAccent()}; border-radius: 999px;` +
            ` box-shadow: 0 0 0 2px ${outlineSoft(0.35)}, 0 2px 6px ${dropShadow(0.45)};`);
    };
    paint();
    return {
        update(v) {
            v = clamp01(v);
            paint();
            const fw = Math.max(K, Math.round(W * v));
            fill.width = fw;
            const ky = Math.round((H - K) / 2);
            const kx = Math.max(0, Math.min(W - K, fw - K / 2));
            setPos(knob, kx, ky);
        },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.05,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: 16-bar LED meter  (C)
// ————————————————————————————————————————————————————————
function styleMeter(brush, container) {
    const W = brush.width, H = 18, N = 16, GAP = 2, PAD = 2;
    container.width = W;
    container.height = H;
    const barW = Math.max(3, Math.floor((W - PAD * 2 - GAP * (N - 1)) / N));
    const bars = [];
    for (let i = 0; i < N; i++) {
        const b = mk(container, barW, 12);
        css(b, `width: ${barW}px; height: 12px; border-radius: 2px;`);
        setPos(b, PAD + i * (barW + GAP), (H - 12) / 2);
        bars.push(b);
    }
    const paint = () => {
        const on = Math.round(clamp01(brush.value ?? 0) * N);
        const [r, g, b] = hexRgb(brush.accent());
        bars.forEach((seg, i) => {
            const lit = i < on;
            seg.opacity = lit ? 255 : 48;
            seg.style = `width: ${barW}px; height: 12px; border-radius: 2px;` +
                ` background-color: rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${lit ? 1 : 0.3});`;
        });
    };
    paint();
    return {
        update(v) { brush.value = v; paint(); },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.05,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: lightsaber glow  (D)
// ————————————————————————————————————————————————————————
function styleLightsaber(brush, container) {
    const W = brush.width, H = 16;
    container.width = W;
    container.height = H;
    const track = mk(container, W, 8);
    css(track, `width: ${W}px; height: 8px; border-radius: 999px; background-color: ${trackQuiet(0.14)};`);
    setPos(track, 0, 4);

    const lb = mk(container, 0, 8);
    const fs = new St.Widget({});
    lb.add_child(fs);
    const core = mk(lb, 0, 4);
    setPos(core, 2, 2);
    setPos(lb, 0, 4);
    const knob = mk(container, 20, 14);
    const paint = () => {
        const a = brush.accent();
        const [r, g, b] = hexRgb(a);
        css(fs, `width: 100%; height: 100%; border-radius: 999px;` +
            ` background-gradient-direction: horizontal; background-gradient-start: ${rgba(a, 0.75)}; background-gradient-end: ${a};` +
            ` box-shadow: 0 0 16px rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.8), 0 0 40px rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.35);`);
        css(core, `width: 100%; height: 4px; border-radius: 999px; background-color: ${rgba(textColor(), 0.9)};` +
            ` box-shadow: 0 0 8px ${rgba(textColor(), 0.5)};`);
        css(knob, `width: 20px; height: 14px; border-radius: 7px; background-color: ${onAccent()};` +
            ` border: 2px solid ${rgba(a, 0.9)}; box-shadow: 0 0 14px ${rgba(a, 0.9)}, 0 2px 6px ${dropShadow(0.45)};`);
    };
    paint();
    return {
        update(v) {
            v = clamp01(v);
            paint();
            lb.width = Math.max(0, Math.round(W * v));
            core.width = Math.max(0, W * v - 4);
            setPos(knob, Math.max(-6, Math.min(W - 14, Math.round(W * v) - 10)), 1);
        },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.05,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: carved capsule  (F)
// ————————————————————————————————————————————————————————
function styleCarved(brush, container) {
    const W = brush.width, H = 34, GX = 12;
    container.width = W;
    container.height = H;
    css(container, `width: ${W}px; height: ${H}px; border-radius: 14px;` +
        ` background-gradient-direction: vertical; background-gradient-start: ${rgba(textColor(), 0.05)}; background-gradient-end: ${rgba(textColor(), 0.04)};`);
    const gw = W - GX * 2, gh = 16;
    const groove = mk(container, gw, gh);
    css(groove, `width: ${gw}px; height: ${gh}px; border-radius: 8px;` +
        ` box-shadow: inset 0 2px 6px ${rgba(textColor(), 0.35)}, inset 0 -1px 0 ${rgba(textColor(), 0.08)};` +
        ` background-gradient-direction: vertical; background-gradient-start: ${surfaceSolid()}; background-gradient-end: ${rgba(textColor(), 0.12)};`);
    setPos(groove, GX, (H - gh) / 2);

    const gf = mk(groove, 0, gh);
    css(gf, `height: ${gh}px; border-radius: 7px;`);
    const gknob = mk(groove, 30, 30);
    const paint = () => {
        css(gf, `height: ${gh}px; background-gradient-direction: vertical;` +
            ` background-gradient-start: ${brush.accent()}; background-gradient-end: ${rgba(brush.accent(), 0.75)}; border-radius: 7px;`);
        css(gknob, `width: 30px; height: 30px; border-radius: 9px; background-color: ${onAccent()};` +
            ` box-shadow: 0 4px 12px ${dropShadow(0.5)}, inset 0 0 0 1px ${rgba(textColor(), 0.1)}; border: 3px solid ${outlineSoft(0.45)};`);
    };
    paint();
    return {
        update(v) {
            v = clamp01(v);
            paint();
            gf.width = Math.max(0, Math.round(gw * v));
            const kh = 30;
            setPos(gknob, Math.max(-kh / 2, Math.min(gw - kh / 2, Math.round(gw * v) - kh / 2)), (gh - kh) / 2);
        },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.05,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: neon 0-point  (G)
// ————————————————————————————————————————————————————————
function styleNeon(brush, container) {
    const W = brush.width, H = 34, GX = 4, gh = 16;
    container.width = W;
    container.height = H;
    const gw = W - GX * 2;
    const groove = mk(container, gw, gh);
    css(groove, `width: ${gw}px; height: ${gh}px; border-radius: 999px; background-color: ${rgba(surfaceSolid(), 0.9)};` +
        ` border: 2px solid ${rgba(textColor(), 0.18)};`);
    setPos(groove, GX, (H - gh) / 2 - 1);

    const tick = mk(container, 1, gh - 8);
    css(tick, `width: 1px; height: ${gh - 8}px; background-color: ${rgba(textColor(), 0.18)};`);

    const lb = mk(container, 0, gh);
    const fs = new St.Widget({});
    lb.add_child(fs);
    setPos(lb, GX, (H - gh) / 2 - 1);
    const knob = mk(container, 18, 18);
    const posY = (H - gh) / 2 - 1;
    const paint = () => {
        const a = brush.accent();
        css(tick, `width: 1px; height: ${gh - 8}px; background-color: ${rgba(textColor(), 0.18)};`);
        setPos(tick, GX + gw / 2, posY + 4);
        css(fs, `width: 100%; height: 100%; border-radius: 999px;` +
            ` background-gradient-direction: horizontal; background-gradient-start: ${rgba(a, 0.12)}; background-gradient-end: ${rgba(a, 0.6)};` +
            ` box-shadow: 0 0 12px ${rgba(a, 0.5)};`);
        css(knob, `width: 18px; height: 18px; border-radius: 50%; background-color: ${onAccent()};` +
            ` box-shadow: 0 0 14px ${rgba(a, 0.9)}, 0 2px 6px ${dropShadow(0.45)};`);
    };
    paint();
    return {
        update(v) {
            v = clamp01(v);
            paint();
            lb.width = Math.max(0, Math.round(gw * v));
            setPos(knob, GX + Math.round(gw * v) - 9, posY + (gh - 18) / 2 + 1);
        },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.05,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: live VU + target  (H)
// ————————————————————————————————————————————————————————
function styleVu(brush, container) {
    const W = brush.width, H = 34, N = 18, GAP = 2, PAD = 4;
    container.width = W;
    container.height = H;
    const barW = Math.max(2, Math.floor((W - PAD * 2 - GAP * (N - 1)) / N));
    const bars = [];
    for (let i = 0; i < N; i++) {
        const b = mk(container, barW, 20);
        setPos(b, PAD + i * (barW + GAP), 6);
        bars.push(b);
    }
    const line = mk(container, 2, H - 6);
    css(line, `width: 2px; height: ${H - 6}px; border-radius: 2px; background-color: ${textColor()};` +
        ` box-shadow: 0 0 6px ${rgba(textColor(), 0.5)};`);
    let tick = 0;
    let onCount = 0;
    const paint = () => {
        const on = Math.round(clamp01(brush.value ?? 0) * N);
        onCount = on;
        const [r, g, b] = hexRgb(brush.accent());
        bars.forEach((bar, i) => {
            const lit = i < on;
            const hgt = 8 + ((i * 7 + 3) % 13);
            bar.width = barW;
            bar.style = `width: ${barW}px; height: ${hgt}px; border-radius: 2px;` +
                ` background-color: rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${lit ? 0.95 : 0.14});`;
            setPos(bar, PAD + i * (barW + GAP), H - hgt - 4);
        });
        const cx = PAD + Math.round(clamp01(brush.value ?? 0) * (N * (barW + GAP)));
        setPos(line, Math.max(0, Math.min(W - 2, cx)), 3);
    };
    paint();
    // Living "shimmer" like an on-air meter; bars above the target stay
    // bright, the rest bob subtly.
    let id = 0;
    const stopVu = () => {
        if (id) {
            try { GLib.source_remove(id); } catch (e) {}
            id = 0;
        }
    };
    const startVu = () => {
        if (id)
            return;
        id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 130, () => {
            tick++;
            bars.forEach((bar, i) => {
                if (i < onCount)
                    return;
                if ((tick + i) % 4 === 0)
                    bar.opacity = 255;
                else if ((tick + i) % 4 === 1)
                    bar.opacity = 130;
            });
            return GLib.SOURCE_CONTINUE;
        });
    };
    try {
        container.connect('notify::mapped', () => {
            try {
                if (container.mapped)
                    startVu();
                else
                    stopVu();
            } catch (e) {}
        });
        if (container.mapped)
            startVu();
    } catch (e) {
        startVu();
    }
    return {
        update(v) { brush.value = v; paint(); },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.05,
        destroy() { stopVu(); },
    };
}

// ————————————————————————————————————————————————————————
//  Builder: snap-step + reel  (I)
// ————————————————————————————————————————————————————————
function styleSnap(brush, container) {
    const W = brush.width, H = 34, PAD = 4;
    container.width = W;
    container.height = H;
    const gw = W - PAD * 2;
    const dots = [];
    for (let i = 0; i < 10; i++) {
        const d = mk(container, 4, 4);
        css(d, `width: 4px; height: 4px; border-radius: 50%; background-color: ${rgba(textColor(), 0.28)};`);
        setPos(d, PAD + i * (gw) / 9 - 2, 12);
        dots.push(d);
    }
    const tk = mk(container, gw, 6);
    css(tk, `width: ${gw}px; height: 6px; border-radius: 999px; background-color: ${trackBg(0.2)};`);
    setPos(tk, PAD, 16);
    const f = mk(container, 0, 6);
    css(f, `height: 6px; border-radius: 999px;`);
    const knob = mk(container, 16, 16);
    const reel = new St.Label({});
    container.add_child(reel);
    const paint = () => {
        const a = brush.accent();
        css(f, `height: 6px; background-gradient-direction: horizontal; background-gradient-start: ${a}; background-gradient-end: ${a};`);
        css(knob, `width: 16px; height: 16px; border-radius: 50%; background-color: ${onAccent()};` +
            ` box-shadow: 0 2px 6px ${dropShadow(0.45)}; border: 1px solid ${outlineSoft(0.4)};`);
        css(reel, `width: 44px; background-color: ${a}; color: ${onAccent()}; font-size: 10px; font-weight: 700;` +
            ` text-align: center; border-radius: 5px; padding: 1px 0;`);
    };
    paint();
    const snap = v => Math.round(clamp01(v) * 10) / 10;
    return {
        update(v) {
            v = snap(v);
            brush.value = v;
            paint();
            const x = Math.round(PAD + gw * v);
            f.width = Math.max(0, x - PAD);
            setPos(f, PAD, 16);
            setPos(knob, Math.max(0, Math.min(W - 8, x - 8)), 8);
            reel.text = pct(v);
            setPos(reel, Math.max(-20, Math.min(W - 24, x - 22)), -2);
        },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.1,
        normalize: snap,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: dual-end cursor  (J)
// ————————————————————————————————————————————————————————
function styleCursor(brush, container) {
    const W = brush.width, H = 34, TY = 14, TH = 8;
    container.width = W;
    container.height = H;
    css(container, `width: ${W}px; height: ${H}px;`);
    const track = mk(container, W, TH);
    css(track, `width: ${W}px; height: ${TH}px; border-radius: 999px; background-color: ${trackBg(0.2)};`);
    setPos(track, 0, TY);

    const lb = mk(container, 0, TH);
    const ft = mk(lb, 0, TH);
    const capL = mk(container, 22, 22);
    const capR = mk(container, 22, 22);
    const knob = mk(container, 12, 26);
    const paint = () => {
        const a = brush.accent();
        css(lb, `height: ${TH}px; border-radius: 999px;` +
            ` background-gradient-direction: horizontal; background-gradient-start: ${rgba(a, 0.35)};` +
            ` background-gradient-end: ${rgba(a, 0.95)}; box-shadow: 0 0 16px ${rgba(a, 0.4)};`);
        css(ft, `width: 8px; height: ${TH}px; border-radius: 999px; background-color: ${onAccent()}; box-shadow: 0 0 10px ${rgba(textColor(), 0.5)};`);
        css(knob, `width: 12px; height: 26px; border-radius: 6px; background-color: ${onAccent()};` +
            ` border: 2px solid ${outlineSoft(0.5)}; box-shadow: 0 3px 12px ${dropShadow(0.45)};`);
        css(capL, `width: 22px; height: 22px; border-radius: 50%; background-color: ${surfaceSolid()};` +
            ` box-shadow: 0 2px 8px ${dropShadow(0.4)}; border: 1px solid ${outlineSoft(0.2)};`);
        css(capR, `width: 22px; height: 22px; border-radius: 50%; background-color: ${surfaceSolid()};` +
            ` box-shadow: 0 2px 8px ${dropShadow(0.4)}; border: 1px solid ${outlineSoft(0.2)};`);
    };
    paint();
    setPos(lb, 0, TY);
    setPos(capL, -2, (H - 22) / 2);
    setPos(capR, W - 20, (H - 22) / 2);
    return {
        update(v) {
            v = clamp01(v);
            paint();
            const x = Math.round(W * v);
            lb.width = x;
            setPos(lb, 0, TY);
            ft.width = Math.max(0, x);
            setPos(ft, 0, TY);
            setPos(knob, Math.max(-4, Math.min(W - 8, x - 6)), (H - 26) / 2);
        },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.01,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: vertical twin rail  (B)
// ————————————————————————————————————————————————————————
function styleRails(brush, container) {
    const W = 24, H = 104, TW = 14;
    container.width = W;
    container.height = H;
    const tx = (W - TW) / 2;
    const track = mk(container, TW, H);
    css(track, `width: ${TW}px; height: ${H}px; border-radius: 8px; background-color: ${trackBg(0.2)};`);
    setPos(track, tx, 0);
    const f = mk(container, TW, 0);
    css(f, `width: ${TW}px; border-radius: 8px;`);
    const knob = mk(container, 22, 22);
    const paint = () => {
        css(f, `width: ${TW}px; background-gradient-direction: vertical;` +
            ` background-gradient-start: ${rgba(brush.accent(), 0.8)}; background-gradient-end: ${brush.accent()};`);
        css(knob, `width: 22px; height: 22px; border-radius: 8px; background-color: ${onAccent()};` +
            ` box-shadow: 0 3px 10px ${dropShadow(0.45)}; border: 3px solid ${outlineSoft(0.4)};`);
    };
    paint();
    return {
        update(v) {
            v = clamp01(v);
            paint();
            const fh = Math.round(H * v);
            f.height = fh;
            setPos(f, tx, H - fh);
            const ky = Math.max(-3, Math.min(H - 19, H - Math.round(H * v) - 11));
            setPos(knob, tx - 4, ky);
        },
        axis: 'y',
        ratioFromEvent: e => yR(container, H, e),
        scrollStep: 0.05,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: wavy liquid fill  (E) — Cairo canvas
// ————————————————————————————————————————————————————————
function styleWavy(brush, container) {
    if (!Clutter.Canvas)
        return styleClassic(brush, container);
    const W = brush.width, H = 34;
    container.width = W;
    container.height = H;
    css(container, `width: ${W}px; height: ${H}px;`);
    let value = 0;
    const canvas = new Clutter.Canvas();
    canvas.set_size(W, H);
    canvas.connect('draw', (_c, cr, w, h) => {
        try {
            const barH = 6, barY = (h - barH) / 2 + 4;
            const base = barY + barH;
            cr.set_antialias(Cairo.Antialias.BEST);
            {
                const [tr, tg, tb] = hexRgb(textColor());
                cr.set_source_rgba(tr, tg, tb, 0.22);
            }
            cRounded(cr, 0, barY, w, barH, barH / 2);
            cr.fill();
            const fx = 8 + (w - 16) * clamp01(value);
            const [r, g, b] = hexRgb(brush.accent());
            // liquid area (wave crest above the bar up to the cursor)
            cr.set_source_rgba(r, g, b, 0.30);
            cr.new_path();
            cr.moveTo(0, base);
            const steps = 14;
            for (let i = 0; i <= steps; i++) {
                const x = (fx) * (i / steps);
                const y = base - 4 - Math.abs(Math.sin(x / 11 + 1.4)) * 9;
                cr.lineTo(x, y);
            }
            cr.lineTo(fx, h);
            cr.lineTo(0, h);
            cr.close_path();
            cr.fill();
            // wave crest line
            cr.set_source_rgba(r, g, b, 0.9);
            cr.set_line_width(2);
            cr.set_line_cap(Cairo.LineCap.ROUND);
            cr.new_path();
            cr.moveTo(2, base - 4 - Math.abs(Math.sin(2 / 11 + 1.4)) * 9);
            for (let i = 1; i <= steps; i++) {
                const x = (fx) * (i / steps);
                const y = base - 4 - Math.abs(Math.sin(x / 11 + 1.4)) * 9;
                cr.lineTo(x, y);
            }
            cr.stroke();
            // glossy knob dot at the cursor
            const cy = base - 4 - Math.abs(Math.sin((fx + 1) / 11 + 1.4)) * 9;
            {
                const [kr, kg, kb] = hexRgb(onAccent());
                cr.set_source_rgba(kr, kg, kb, 0.95);
            }
            cr.arc(fx, cy, 4, 0, TWO_PI);
            cr.fill();
        } catch (e) {}
        return true;
    });
    container.content = canvas;
    return {
        update(v) { value = v; try { canvas.invalidate(); } catch (e) {} },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.05,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: arc ring dial  (A) — Cairo canvas
// ————————————————————————————————————————————————————————
function styleArc(brush, container) {
    if (!Clutter.Canvas)
        return styleClassic(brush, container);
    const S = 96, CX = S / 2, CY = S / 2, R = 38, TH = 9;
    container.width = S;
    container.height = S;
    css(container, `width: ${S}px; height: ${S}px;`);
    let value = 0;
    const canvas = new Clutter.Canvas();
    canvas.set_size(S, S);
    canvas.connect('draw', (_c, cr, w, h) => {
        try {
            const [r, g, b] = hexRgb(brush.accent());
            const [sr, sg, sb] = hexRgb(surface());
            cr.set_antialias(Cairo.Antialias.BEST);
            // dial disc
            cr.set_source_rgba(sr, sg, sb, 0.96);
            cRounded(cr, 2, 2, S - 4, S - 4, S / 2);
            cr.fill();
            // inner darker band (disc)
            {
                const [sr, sg, sb] = hexRgb(surfaceSolid());
                cr.set_source_rgba(sr, sg, sb, 1);
            }
            cr.arc(CX, CY, R + TH / 2 + 2, 0, TWO_PI);
            cr.fill();
            // track ring
            {
                const [tr, tg, tb] = hexRgb(textColor());
                cr.set_source_rgba(tr, tg, tb, 0.35);
            }
            cr.set_line_width(TH);
            cr.arc(CX, CY, R, 0, TWO_PI);
            cr.stroke();
            // dash zero marker
            {
                const [tr, tg, tb] = hexRgb(textColor());
                cr.set_source_rgba(tr, tg, tb, 0.9);
            }
            cr.arc(CX, CY - R - TH / 2, 2.2, 0, TWO_PI);
            cr.fill();
            // active arc (clockwise from top)
            cr.set_source_rgba(r, g, b, 1);
            cr.set_line_width(TH);
            cr.set_line_cap(Cairo.LineCap.ROUND);
            cr.arc(CX, CY, R, -Math.PI / 2, -Math.PI / 2 + clamp01(value) * TWO_PI);
            cr.stroke();
            // end cap dot
            const a = -Math.PI / 2 + clamp01(value) * TWO_PI;
            {
                const [kr, kg, kb] = hexRgb(onAccent());
                cr.set_source_rgba(kr, kg, kb, 0.95);
            }
            cr.arc(CX + Math.cos(a) * R, CY + Math.sin(a) * R, 4, 0, TWO_PI);
            cr.fill();
        } catch (e) {}
        return true;
    });
    container.content = canvas;
    const overlay = new St.BoxLayout({vertical: true, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.CENTER});
    const tx = new St.Label({text: '0%'});
    css(tx, 'font-size: 22px; font-weight: 700;');
    overlay.add_child(tx);
    container.add_child(overlay);
    try { container.layout_manager = new Clutter.BinLayout(); } catch (e) {}
    return {
        update(v) {
            value = v;
            tx.text = pct(v);
            try { canvas.invalidate(); } catch (e) {}
        },
        axis: 'polar',
        ratioFromEvent(e) {
            const [ax, ay] = container.get_transformed_position();
            const [ex, ey] = e.get_coords();
            const dx = ex - (ax + CX), dy = ey - (ay + CY);
            if (dx === 0 && dy === 0)
                return 0;
            const deg = Math.atan2(dy, dx) * 180 / Math.PI;
            const t = (deg + 90) / 360;
            return t - Math.floor(t);
        },
        scrollStep: 0.05,
    };
}

// ————————————————————————————————————————————————————————
//  Builders registry + createSlider
// ————————————————————————————————————————————————————————
const BUILDERS = {
    classic: styleClassic,
    meter: styleMeter,
    lightsaber: styleLightsaber,
    carved: styleCarved,
    neon: styleNeon,
    vu: styleVu,
    snap: styleSnap,
    cursor: styleCursor,
    rails: styleRails,
    wavy: styleWavy,
    arc: styleArc,
};

export function sliderStyleFor(id, which) {
    if (!isValidSliderStyle(id))
        id = 'classic';
    // End-4 dual capsule is horizontal-only — tall dials/rails break the row.
    const layout = globalThis._materialPanelLayoutStyle;
    if ((id === 'rails' || id === 'arc') && layout === 'end4')
        id = 'classic';
    // classic keeps the original primary accent; the fancy styles show the
    // two-tone accents (volume = secondary, brightness = tertiary).
    return {id, which, accent: id === 'classic' ? null : sideAccent(which)};
}

export function createSlider({initialValue = 0, onChange, width = DEFAULT_TRACK_WIDTH, style = 'classic', accent = null} = {}) {
    const TRACK_WIDTH = Math.max(48, Math.round(width));
    const brush = {
        width: TRACK_WIDTH,
        accent: () => accent ?? primary(),
        value: initialValue,
    };

    const container = new St.Widget({
        reactive: true,
        can_focus: true,
        x_expand: false,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        container.accessible_role = Atk.Role.SLIDER;
        container.accessible_name = 'Slider';
    } catch (e) {}

    const builder = (BUILDERS[style] || BUILDERS.classic)(brush, container);

    let value = clamp01(initialValue);
    let dragging = false;
    let throttleTimeoutId = null;

    const normalize = builder.normalize || (v => clamp01(v));
    const setValue = v => {
        value = normalize(clamp01(v));
        brush.value = value;
        builder.update(value);
    };

    const emitNow = () => {
        if (onChange)
            onChange(value);
    };
    const emitThrottled = () => {
        if (throttleTimeoutId)
            return;
        throttleTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, EMIT_THROTTLE_MS, () => {
            throttleTimeoutId = null;
            emitNow();
            return GLib.SOURCE_REMOVE;
        });
    };
    const cancelThrottle = () => {
        if (throttleTimeoutId) {
            try { GLib.source_remove(throttleTimeoutId); } catch (e) {}
            throttleTimeoutId = null;
        }
    };

    const applyFromEvent = (event, immediate) => {
        let r;
        try { r = builder.ratioFromEvent(event); } catch (e) { r = null; }
        if (r == null || !Number.isFinite(r))
            return;
        setValue(r);
        if (immediate) {
            cancelThrottle();
            emitNow();
        } else {
            emitThrottled();
        }
    };

    let stageMotionId = 0;
    let stageReleaseId = 0;
    const attachStageDrag = () => {
        if (stageMotionId)
            return;
        stageMotionId = global.stage.connect('captured-event', (_a, ev) => {
            if (!dragging)
                return Clutter.EVENT_PROPAGATE;
            if (ev.type() === Clutter.EventType.MOTION) {
                applyFromEvent(ev, false);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        stageReleaseId = global.stage.connect('captured-event', (_a, ev) => {
            if (!dragging)
                return Clutter.EVENT_PROPAGATE;
            if (ev.type() === Clutter.EventType.BUTTON_RELEASE) {
                dragging = false;
                if (stageMotionId) {
                    global.stage.disconnect(stageMotionId);
                    stageMotionId = 0;
                }
                if (stageReleaseId) {
                    global.stage.disconnect(stageReleaseId);
                    stageReleaseId = 0;
                }
                cancelThrottle();
                emitNow();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    };
    const detachStageDrag = () => {
        if (stageMotionId) {
            try { global.stage.disconnect(stageMotionId); } catch (e) {}
            stageMotionId = 0;
        }
        if (stageReleaseId) {
            try { global.stage.disconnect(stageReleaseId); } catch (e) {}
            stageReleaseId = 0;
        }
    };

    container.connect('key-press-event', (_a, event) => {
        const step = builder.scrollStep ?? 0.05;
        let sym = 0;
        try { sym = event.get_key_symbol(); } catch (e) { return Clutter.EVENT_PROPAGATE; }
        if (sym === Clutter.KEY_Left || sym === Clutter.KEY_Down || sym === Clutter.KEY_KP_Subtract) {
            setValue(value - step);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Right || sym === Clutter.KEY_Up || sym === Clutter.KEY_KP_Add) {
            setValue(value + step);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Home) {
            setValue(0);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_End) {
            setValue(1);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    container.connect('scroll-event', (_a, event) => {
        let dir;
        try { dir = event.get_scroll_direction(); } catch (e) { return Clutter.EVENT_PROPAGATE; }
        const step = builder.scrollStep ?? 0.05;
        if (dir === Clutter.ScrollDirection.UP || dir === Clutter.ScrollDirection.RIGHT) {
            setValue(value + step);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        if (dir === Clutter.ScrollDirection.DOWN || dir === Clutter.ScrollDirection.LEFT) {
            setValue(value - step);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    container.connect('button-press-event', (_a, event) => {
        dragging = true;
        attachStageDrag();
        applyFromEvent(event, true);
        return Clutter.EVENT_STOP;
    });
    container.connect('motion-event', (_a, event) => {
        if (dragging)
            applyFromEvent(event, false);
        return Clutter.EVENT_STOP;
    });
    container.connect('button-release-event', (_a, event) => {
        if (dragging) {
            dragging = false;
            detachStageDrag();
            cancelThrottle();
            emitNow();
        }
        return Clutter.EVENT_STOP;
    });
    container.connect('destroy', () => {
        detachStageDrag();
        cancelThrottle();
        if (builder.destroy)
            builder.destroy();
    });

    setValue(initialValue);

    return {
        actor: container,
        setValue,
        getValue: () => value,
    };
}