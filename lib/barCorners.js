/**
 * end-4 Hug round decorators — under bar ends, curve downward.
 */
import GObject from 'gi://GObject';
import St from 'gi://St';
import Cairo from 'gi://cairo';

function parseColor(cssColor) {
    try {
        if (!cssColor)
            return {r: 0.12, g: 0.1, b: 0.16, a: 1};
        const s = String(cssColor).trim();
        if (s.startsWith('#')) {
            let h = s.slice(1);
            if (h.length === 3)
                h = h.split('').map(c => c + c).join('');
            return {
                r: parseInt(h.slice(0, 2), 16) / 255,
                g: parseInt(h.slice(2, 4), 16) / 255,
                b: parseInt(h.slice(4, 6), 16) / 255,
                a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
            };
        }
        const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
        if (m) {
            const scale = Number(m[1]) > 1 ? 255 : 1;
            return {
                r: Number(m[1]) / scale,
                g: Number(m[2]) / scale,
                b: Number(m[3]) / scale,
                a: m[4] != null ? Number(m[4]) : 1,
            };
        }
    } catch (e) {}
    return {r: 0.12, g: 0.1, b: 0.16, a: 1};
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
        this._side = side;
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
        try {
            this.set_width(size);
            this.set_height(size);
        } catch (e) {
            this.width = size;
            this.height = size;
        }
        this.queue_repaint();
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const R = Math.max(1, this._size);
        const {r, g, b, a} = this._color;

        // Even-odd: square minus circle → ear under bar end
        try {
            cr.setFillRule(Cairo.FillRule.EVEN_ODD);
        } catch (e) {
            try { cr.setFillRule(1); } catch (e2) {}
        }
        cr.setSourceRGBA(r, g, b, a);
        cr.newPath();
        cr.rectangle(0, 0, R, R);
        if (this._side === 'left') {
            // Circle centered at bottom-right of the square
            cr.arc(R, R, R, 0, Math.PI * 2);
        } else {
            // Circle centered at bottom-left of the square
            cr.arc(0, R, R, 0, Math.PI * 2);
        }
        cr.fill();
        cr.$dispose();
    }
});

export function buildHugCorners(size = 12, colorCss = null) {
    const row = new St.BoxLayout({
        style_class: 'material-panel-bar-corners',
        vertical: false,
        x_expand: true,
        y_expand: false,
    });
    try {
        row.style = `height: ${size}px;`;
    } catch (e) {}

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
    return Math.max(10, Math.round(12 * (Number(scale) || 1)));
}
