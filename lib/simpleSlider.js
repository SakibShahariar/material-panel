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
    // Prefer matugen secondary; else same as primary so we never invent a second palette
    return globalThis._materialPanelSecondary ?? primary();
}
function tertiary() {
    return globalThis._materialPanelTertiary ?? primary();
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
// One accent family with the rest of QS (primary). secondary/tertiary only if
// explicitly present on globalThis from matugen AND different use is desired later.
function sideAccent(_which) {
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
        const a = primary();
        const [r, g, b] = hexRgb(a);
        const R = Math.round(r * 255), G = Math.round(g * 255), B = Math.round(b * 255);
        css(fs, `width: 100%; height: 100%; border-radius: 999px;` +
            ` background-gradient-direction: horizontal; background-gradient-start: ${rgba(a, 0.55)}; background-gradient-end: ${a};` +
            ` box-shadow: 0 0 12px rgba(${R},${G},${B},0.95), 0 0 28px rgba(${R},${G},${B},0.55), 0 0 48px rgba(${R},${G},${B},0.25);`);
        css(core, `width: 100%; height: 4px; border-radius: 999px; background-color: ${rgba(a, 0.95)};` +
            ` box-shadow: 0 0 10px rgba(${R},${G},${B},0.9);`);
        css(knob, `width: 20px; height: 14px; border-radius: 7px; background-color: ${onAccent()};` +
            ` border: 2px solid ${a}; box-shadow: 0 0 16px rgba(${R},${G},${B},1), 0 2px 6px ${dropShadow(0.45)};`);
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
//  Builder: neon 0-point  (G) — center marker, fill from left with primary glow
// ————————————————————————————————————————————————————————
function styleNeon(brush, container) {
    const W = brush.width, H = 28, PAD = 6, gh = 12;
    container.width = W;
    container.height = H;
    const gw = W - PAD * 2;
    const track = mk(container, gw, gh);
    css(track, `width: ${gw}px; height: ${gh}px; border-radius: 999px; background-color: ${trackBg(0.18)};`);
    setPos(track, PAD, (H - gh) / 2);

    const fill = mk(container, 0, gh);
    setPos(fill, PAD, (H - gh) / 2);

    // Center zero marker (visual only)
    const tick = mk(container, 2, gh + 6);
    css(tick, `width: 2px; height: ${gh + 6}px; border-radius: 1px;`);
    setPos(tick, PAD + gw / 2 - 1, (H - gh - 6) / 2);

    const knob = mk(container, 16, 16);
    const paint = () => {
        const a = primary();
        const [r, g, b] = hexRgb(a);
        const R = Math.round(r * 255), G = Math.round(g * 255), B = Math.round(b * 255);
        css(tick, `width: 2px; height: ${gh + 6}px; border-radius: 1px; background-color: ${rgba(a, 0.85)};` +
            ` box-shadow: 0 0 8px rgba(${R},${G},${B},0.8);`);
        css(fill, `height: ${gh}px; border-radius: 999px; background-color: ${a};` +
            ` box-shadow: 0 0 14px rgba(${R},${G},${B},0.75), 0 0 28px rgba(${R},${G},${B},0.35);`);
        css(knob, `width: 16px; height: 16px; border-radius: 50%; background-color: ${onAccent()};` +
            ` border: 2px solid ${a}; box-shadow: 0 0 12px rgba(${R},${G},${B},0.9);`);
    };
    paint();
    return {
        update(v) {
            v = clamp01(v);
            paint();
            const w = Math.max(0, Math.round(gw * v));
            fill.width = w;
            setPos(knob, PAD + w - 8, (H - 16) / 2);
        },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.05,
    };
}

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
        hideExternalValue: true,
    };
}

// ————————————————————————————————————————————————————————
//  Builder: dual-end cursor  (J)
// ————————————————————————————————————————————————————————
function styleCursor(brush, container) {
    // Dual-end: fixed end caps + primary fill + tall cursor knob
    const W = brush.width, H = 32, TH = 8, CAP = 16;
    container.width = W;
    container.height = H;
    css(container, `width: ${W}px; height: ${H}px;`);

    const trackX = CAP / 2;
    const trackW = W - CAP;
    const track = mk(container, trackW, TH);
    setPos(track, trackX, (H - TH) / 2);

    const fill = mk(container, 0, TH);
    setPos(fill, trackX, (H - TH) / 2);

    const capL = mk(container, CAP, CAP);
    const capR = mk(container, CAP, CAP);
    const knob = mk(container, 12, 24);

    const paint = () => {
        const a = primary();
        css(track, `width: ${trackW}px; height: ${TH}px; border-radius: 999px; background-color: ${trackBg(0.2)};`);
        css(fill, `height: ${TH}px; border-radius: 999px; background-color: ${a};`);
        css(capL, `width: ${CAP}px; height: ${CAP}px; border-radius: 50%; background-color: ${surfaceSolid()};` +
            ` border: 2px solid ${a};`);
        css(capR, `width: ${CAP}px; height: ${CAP}px; border-radius: 50%; background-color: ${surfaceSolid()};` +
            ` border: 2px solid ${outlineSoft(0.4)};`);
        css(knob, `width: 12px; height: 24px; border-radius: 6px; background-color: ${onAccent()};` +
            ` border: 2px solid ${a}; box-shadow: 0 2px 8px ${dropShadow(0.4)};`);
    };
    paint();
    setPos(capL, 0, (H - CAP) / 2);
    setPos(capR, W - CAP, (H - CAP) / 2);
    return {
        update(v) {
            v = clamp01(v);
            paint();
            const x = Math.round(trackW * v);
            fill.width = Math.max(0, x);
            setPos(fill, trackX, (H - TH) / 2);
            // active end = left cap primary, right stays muted until full
            const a = primary();
            if (v > 0.98)
                css(capR, `width: ${CAP}px; height: ${CAP}px; border-radius: 50%; background-color: ${a}; border: 2px solid ${a};`);
            setPos(knob, Math.max(0, Math.min(W - 12, trackX + x - 6)), (H - 24) / 2);
        },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.02,
    };
}

//  Builder: vertical twin rails  (B) — two rails side by side
// ————————————————————————————————————————————————————————
function styleRails(brush, container) {
    // Single vertical rail (volume and brightness sit side-by-side in the QS row)
    const H = 110, TW = 14, W = 28;
    container.width = W;
    container.height = H;
    css(container, `width: ${W}px; height: ${H}px;`);

    const tx = Math.round((W - TW) / 2);
    const track = mk(container, TW, H);
    setPos(track, tx, 0);
    const fill = mk(container, TW, 0);
    setPos(fill, tx, 0);
    const knob = mk(container, 22, 22);

    const paint = () => {
        const a = primary();
        css(track, `width: ${TW}px; height: ${H}px; border-radius: 999px; background-color: ${trackBg(0.2)};`);
        css(fill, `width: ${TW}px; border-radius: 999px; background-color: ${a};`);
        css(knob, `width: 22px; height: 22px; border-radius: 11px; background-color: ${onAccent()};` +
            ` border: 2px solid ${a}; box-shadow: 0 2px 8px ${dropShadow(0.4)};`);
    };
    paint();
    return {
        update(v) {
            v = clamp01(v);
            paint();
            const fh = Math.max(0, Math.round(H * v));
            fill.height = fh;
            setPos(fill, tx, H - fh);
            setPos(knob, Math.round((W - 22) / 2), Math.max(0, Math.min(H - 22, H - fh - 11)));
        },
        axis: 'y',
        ratioFromEvent: e => yR(container, H, e),
        scrollStep: 0.05,
    };
}

function styleWavy(brush, container) {
    // Liquid fill under a sine crest — Cairo when available, else segmented approx
    const W = Math.max(120, brush.width), H = 40;
    container.width = W;
    container.height = H;
    css(container, `width: ${W}px; height: ${H}px;`);

    if (!Clutter.Canvas) {
        // Segmented bar approximation so it never silently becomes classic
        const track = mk(container, W, 10);
        setPos(track, 0, 15);
        css(track, `width: ${W}px; height: 10px; border-radius: 999px; background-color: ${trackBg(0.2)};`);
        const segs = [];
        const n = 12;
        for (let i = 0; i < n; i++) {
            const s = mk(container, Math.floor(W / n) - 2, 8);
            segs.push(s);
        }
        return {
            update(v) {
                v = clamp01(v);
                const a = primary();
                const on = Math.round(v * n);
                segs.forEach((s, i) => {
                    const h = 6 + Math.round(Math.abs(Math.sin(i * 0.7 + v * 4)) * 14);
                    s.height = h;
                    setPos(s, i * Math.floor(W / n) + 1, H - 8 - h);
                    css(s, `width: ${Math.floor(W / n) - 2}px; height: ${h}px; border-radius: 4px;` +
                        ` background-color: ${i < on ? a : trackBg(0.15)};`);
                });
            },
            axis: 'x',
            ratioFromEvent: e => xR(container, W, e),
            scrollStep: 0.05,
        };
    }

    let value = 0;
    const canvas = new Clutter.Canvas();
    canvas.set_size(W * 2, H * 2); // hi-dpi-ish
    canvas.connect('draw', (_c, cr, w, h) => {
        try {
            cr.set_antialias(Cairo.Antialias.BEST);
            cr.scale(w / W, h / H);
            const [tr, tg, tb] = hexRgb(textColor());
            const [ar, ag, ab] = hexRgb(primary());
            const [or_, og, ob] = hexRgb(onAccent());
            // trough
            cr.set_source_rgba(tr, tg, tb, 0.18);
            cRounded(cr, 2, 12, W - 4, 16, 8);
            cr.fill();
            const v = clamp01(value);
            const fx = 8 + (W - 16) * v;
            const base = 28;
            // liquid body
            cr.set_source_rgba(ar, ag, ab, 0.5);
            cr.new_path();
            cr.moveTo(4, base);
            const steps = 64;
            for (let i = 0; i <= steps; i++) {
                const x = 4 + (fx - 4) * (i / steps);
                const wave = Math.sin(x * 0.22 + v * 5) * 5.5;
                cr.lineTo(x, base - 4 - wave - v * 6);
            }
            cr.lineTo(fx, base);
            cr.close_path();
            cr.fill();
            // crest
            cr.set_source_rgba(ar, ag, ab, 1);
            cr.set_line_width(2.5);
            cr.set_line_cap(Cairo.LineCap.ROUND);
            cr.new_path();
            for (let i = 0; i <= steps; i++) {
                const x = 4 + (fx - 4) * (i / steps);
                const wave = Math.sin(x * 0.22 + v * 5) * 5.5;
                const y = base - 4 - wave - v * 6;
                if (i === 0) cr.moveTo(x, y);
                else cr.lineTo(x, y);
            }
            cr.stroke();
            // knob
            const wave = Math.sin(fx * 0.22 + v * 5) * 5.5;
            const cy = base - 4 - wave - v * 6;
            cr.set_source_rgba(ar, ag, ab, 1);
            cr.arc(fx, cy, 7, 0, TWO_PI);
            cr.fill();
            cr.set_source_rgba(or_, og, ob, 1);
            cr.arc(fx, cy, 4, 0, TWO_PI);
            cr.fill();
        } catch (e) {}
        return true;
    });
    container.content = canvas;
    try { canvas.invalidate(); } catch (e) {}
    return {
        update(v) {
            value = clamp01(v);
            try { canvas.invalidate(); } catch (e) {}
        },
        axis: 'x',
        ratioFromEvent: e => xR(container, W, e),
        scrollStep: 0.05,
    };
}

function styleArc(brush, container) {
    const S = 108, CX = S / 2, CY = S / 2, R = 38, TH = 11;
    container.width = S;
    container.height = S;
    css(container, `width: ${S}px; height: ${S}px;`);

    if (!Clutter.Canvas) {
        // Minimal fallback: classic but square so it's obvious Canvas is missing
        return styleClassic(brush, container);
    }

    let value = 0;
    const canvas = new Clutter.Canvas();
    canvas.set_size(S * 2, S * 2);
    canvas.connect('draw', (_c, cr, w, h) => {
        try {
            cr.set_antialias(Cairo.Antialias.BEST);
            cr.scale(w / S, h / S);
            const [ar, ag, ab] = hexRgb(primary());
            const [tr, tg, tb] = hexRgb(textColor());
            const [sr, sg, sb] = hexRgb(surfaceSolid());
            const [or_, og, ob] = hexRgb(onAccent());
            // disc
            cr.set_source_rgba(sr, sg, sb, 1);
            cr.arc(CX, CY, R + TH / 2 + 4, 0, TWO_PI);
            cr.fill();
            // track ring
            cr.set_source_rgba(tr, tg, tb, 0.25);
            cr.set_line_width(TH);
            cr.set_line_cap(Cairo.LineCap.ROUND);
            cr.arc(CX, CY, R, 0, TWO_PI);
            cr.stroke();
            // active arc from 12 o'clock clockwise
            const span = clamp01(value) * TWO_PI * 0.999;
            if (span > 0.02) {
                cr.set_source_rgba(ar, ag, ab, 1);
                cr.set_line_width(TH);
                cr.set_line_cap(Cairo.LineCap.ROUND);
                cr.arc(CX, CY, R, -Math.PI / 2, -Math.PI / 2 + span);
                cr.stroke();
            }
            // end knob
            const ang = -Math.PI / 2 + span;
            cr.set_source_rgba(ar, ag, ab, 1);
            cr.arc(CX + Math.cos(ang) * R, CY + Math.sin(ang) * R, 8, 0, TWO_PI);
            cr.fill();
            cr.set_source_rgba(or_, og, ob, 1);
            cr.arc(CX + Math.cos(ang) * R, CY + Math.sin(ang) * R, 4.5, 0, TWO_PI);
            cr.fill();
        } catch (e) {}
        return true;
    });
    container.content = canvas;

    const overlay = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const tx = new St.Label({text: '0%'});
    css(tx, `font-size: 16px; font-weight: 700; color: ${textColor()};`);
    overlay.add_child(tx);
    try { container.layout_manager = new Clutter.BinLayout(); } catch (e) {}
    container.add_child(overlay);
    try { canvas.invalidate(); } catch (e) {}

    return {
        update(v) {
            value = clamp01(v);
            tx.text = pct(v);
            try { css(tx, `font-size: 16px; font-weight: 700; color: ${textColor()};`); } catch (e) {}
            try { canvas.invalidate(); } catch (e) {}
        },
        axis: 'polar',
        ratioFromEvent(e) {
            let ax = 0, ay = 0;
            try {
                [ax, ay] = container.get_transformed_position();
            } catch (err) {}
            let ex = 0, ey = 0;
            try {
                [ex, ey] = e.get_coords();
            } catch (err) {
                return value;
            }
            const dx = ex - (ax + CX), dy = ey - (ay + CY);
            if (dx === 0 && dy === 0)
                return value;
            let ang = Math.atan2(dy, dx);
            let t = (ang + Math.PI / 2) / TWO_PI;
            if (t < 0)
                t += 1;
            return t;
        },
        scrollStep: 0.05,
        hideExternalValue: true,
    };
}

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
        hideExternalValue: !!(builder && builder.hideExternalValue),
    };
}