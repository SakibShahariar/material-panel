import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {getThemeColor} from './themeColorState.js';

/**
 * Tiny bar-graph history strip used by panel popups. Built from plain St
 * widgets so it needs no Cairo import and no background sampler: callers push
 * the samples they already collect while the popup is visible.
 */
export function createSparkline({
    count = 28,
    height = 26,
    barWidth = 4,
    spacing = 1,
    styleClass = 'material-panel-sparkline',
    barStyleClass = 'material-panel-sparkline-bar',
} = {}) {
    const actor = new St.BoxLayout({
        style_class: styleClass,
        style: `spacing: ${spacing}px; height: ${height}px;`,
        y_align: Clutter.ActorAlign.END,
        x_expand: true,
    });
    const bars = [];
    for (let i = 0; i < count; i++) {
        const bar = new St.Widget({
            style_class: barStyleClass,
            width: barWidth,
            height: 2,
            y_align: Clutter.ActorAlign.END,
        });
        actor.add_child(bar);
        bars.push(bar);
    }

    let appliedColor = null;
    const applyColor = () => {
        const color = getThemeColor('primary', '#89b4fa');
        if (color === appliedColor)
            return;
        appliedColor = color;
        for (const bar of bars) {
            try { bar.style = `background-color: ${color};`; } catch (e) {}
        }
    };
    applyColor();

    const update = values => {
        const list = Array.isArray(values) ? values : [];
        const start = Math.max(0, list.length - count);
        for (let i = 0; i < count; i++) {
            const value = list[start + i];
            const bar = bars[i];
            if (!Number.isFinite(value)) {
                bar.height = 2;
                bar.opacity = 60;
                continue;
            }
            const clamped = Math.max(0, Math.min(100, value));
            bar.height = Math.max(2, Math.round((clamped / 100) * (height - 2)));
            bar.opacity = 255;
        }
    };

    update([]);
    return {actor, update, applyColor};
}
