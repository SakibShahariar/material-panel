/** Pure panel-size migration and validation for persisted configuration. */
export function normalizePanelSize(parsedPanelSize, defaults) {
    const parsed = parsedPanelSize ?? {};
    let migratedGapTop = parsed.gapTop;
    let migratedGapBottom = parsed.gapBottom;
    if (migratedGapTop == null || migratedGapBottom == null) {
        const legacyGap = parsed.gap;
        if (legacyGap != null) {
            if (migratedGapTop == null)
                migratedGapTop = legacyGap;
            if (migratedGapBottom == null)
                migratedGapBottom = Math.max(0, legacyGap - 1);
        }
    }
    const clean = {
        scale: parsed.scale ?? defaults.scale,
        gapTop: migratedGapTop ?? defaults.gapTop,
        gapBottom: migratedGapBottom ?? defaults.gapBottom,
        gapSide: parsed.gapSide ?? defaults.gapSide ?? 0,
        chipGap: parsed.chipGap ?? defaults.chipGap ?? 4,
        popupOpacity: parsed.popupOpacity ?? defaults.popupOpacity ?? 0.92,
    };
    const parsedScale = Number(clean.scale);
    clean.scale = Math.max(0.7, Math.min(1.5, Number.isFinite(parsedScale) ? parsedScale : 1.0));
    const parsedTop = Number(clean.gapTop);
    clean.gapTop = Math.max(0, Math.min(14, Math.round(Number.isFinite(parsedTop) ? parsedTop : 5)));
    const parsedBottom = Number(clean.gapBottom);
    clean.gapBottom = Math.max(0, Math.min(14, Math.round(Number.isFinite(parsedBottom) ? parsedBottom : 4)));
    let chipGap = Number(clean.chipGap);
    if (!Number.isFinite(chipGap)) chipGap = 4;
    clean.chipGap = Math.max(0, Math.min(16, Math.round(chipGap)));
    let popupOpacity = Number(clean.popupOpacity);
    if (!Number.isFinite(popupOpacity)) popupOpacity = 0.92;
    clean.popupOpacity = Math.max(0.5, Math.min(1, popupOpacity));
    let gapSide = Number(clean.gapSide);
    if (!Number.isFinite(gapSide)) gapSide = 0;
    clean.gapSide = Math.max(0, Math.min(48, Math.round(gapSide)));
    return clean;
}


/** Per-zone multipliers stay deliberately narrow so the global size remains the main control. */
export function normalizeZoneScale(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = {};
    for (const zone of ['left', 'center', 'right']) {
        const raw = source[zone];
        const parsed = typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
        result[zone] = Math.max(0.8, Math.min(1.2, Number.isFinite(parsed) ? parsed : 1));
    }
    return result;
}
