/**
 * end-4 Hug round decorators — sit under the bar ends and curve downward.
 * Mirrors Quickshell RoundCorner TopLeft / TopRight under barContent.
 */
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

function parseColor(cssColor) {
    // "#rrggbb", "#rrggbbaa", or "rgba(r,g,b,a)"
    try {
        if (!cssColor)
            return {r: 0.12, g: 0.1, b: 0.16, a: 0.92};
        const s = String(cssColor).trim();
        if (s.startsWith('#')) {
            let h = s.slice(1);
            if (h.length === 3)
                h = h.split('').map(c => c + c).join('');
            const r = parseInt(h.slice(0, 2), 16) / 255;
            const g = parseInt(h.slice(2, 4), 16) / 255;
            const b = parseInt(h.slice(4, 6), 16) / 255;
            const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 0.92;
            return {r, g, b, a};
        }
        const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
        if (m) {
            return {
                r: Number(m[1]) / 255,
                g: Number(m[2]) / 255,
                b: Number(m[3]) / 255,
                a: m[4] != null ? Number(m[4]) : 0.92,
            };
        }
    } catch (e) {}
    return {r: 0.12, g: 0.1, b: 0.16, a: 0.92};
}

const CornerArea = GObject.registerClass(
class MaterialPanelBarCorner extends St.DrawingArea {
    _init(side, size, colorCss) {
        super._init({
            style_class: `material-panel-bar-corner material-panel-bar-corner-${side}`,
            width: size,
            height: size,
            x_expand: false,
            y_expand: false,
        });
        this._side = side; // 'left' | 'right'
        this._size = size;
        this._color = parseColor(colorCss);
        this.connect('repaint', this._onRepaint.bind(this));
    }

    setCornerColor(cssColor) {
        this._color = parseColor(cssColor);
        this.queue_repaint();
    }

    setCornerSize(size) {
        this._size = size;
        this.set_size(size, size);
        this.queue_repaint();
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const R = this._size;
        const {r, g, b, a} = this._color;
        cr.setSourceRGBA(r, g, b, a);
        cr.newPath();

        if (this._side === 'left') {
            // TopLeft ear: (0,0) → (0,R) → arc to (R,0) → close
            cr.moveTo(0, 0);
            cr.lineTo(0, R);
            // clockwise short arc from west to north around center (R,R)
            cr.arcNegative(R, R, R, Math.PI, 3 * Math.PI / 2);
            cr.closePath();
        } else {
            // TopRight ear: (R,0) → (R,R) → arc to (0,0) → close
            cr.moveTo(R, 0);
            cr.lineTo(R, R);
            cr.arcNegative(0, R, R, 0, -Math.PI / 2);
            cr.closePath();
        }
        cr.fill();
        cr.$dispose();
    }
});

/**
 * Horizontal strip under the bar: left corner | expand | right corner.
 * @param {number} size screenRounding analogue
 * @param {string} colorCss bar fill color
 */
export function buildHugCorners(size = 18, colorCss = null) {
    const row = new St.BoxLayout({
        style_class: 'material-panel-bar-corners',
        vertical: false,
        x_expand: true,
        y_expand: false,
    });
    const left = new CornerArea('left', size, colorCss);
    const spacer = new St.Widget({x_expand: true, y_expand: false});
    const right = new CornerArea('right', size, colorCss);
    row.add_child(left);
    row.add_child(spacer);
    row.add_child(right);
    row._leftCorner = left;
    row._rightCorner = right;
    return row;
}

export function cornerSizeForScale(scale = 1) {
    return Math.max(12, Math.round(18 * (Number(scale) || 1)));
}
