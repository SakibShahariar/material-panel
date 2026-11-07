const VAR_RE = /--([a-zA-Z0-9_]+):\s*([^;]+);/g;

/** Parse Matugen's CSS custom-property declarations into a plain role map. */
export function parseMatugenCssContents(contents) {
    const text = new TextDecoder('utf-8').decode(contents);
    const vars = {};
    let match;
    VAR_RE.lastIndex = 0;
    while ((match = VAR_RE.exec(text)) !== null)
        vars[match[1]] = match[2].trim();
    return vars;
}

export function themeColorInfo(color) {
    try {
        const value = color?.to_string?.() ?? '';
        const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
        if (!match)
            return null;
        const hex = '#' + match[1];
        const r = parseInt(match[1].slice(0, 2), 16);
        const g = parseInt(match[1].slice(2, 4), 16);
        const b = parseInt(match[1].slice(4, 6), 16);
        const alpha = match[2] ? parseInt(match[2], 16) / 255 : 1;
        return {hex, rgb: r + ' ' + g + ' ' + b, alpha, r, g, b};
    } catch (e) {
        return null;
    }
}

export function cssColorRgb(value) {
    const text = String(value ?? '').trim();
    const hex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(text);
    if (hex) {
        return [0, 2, 4].map(offset => parseInt(hex[1].slice(offset, offset + 2), 16)).join(' ');
    }
    const rgb = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i.exec(text);
    return rgb ? [rgb[1], rgb[2], rgb[3]].join(' ') : null;
}

export function contrastColor(color) {
    const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
    return luminance > 0.55 ? '#202020' : '#f5f5f5';
}
