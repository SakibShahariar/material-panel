/** Pure panel-size migration and validation for persisted configuration. */
export function normalizePanelSize(parsedPanelSize, defaults) {
    const parsed = parsedPanelSize ?? {};
    let migratedGapTop = parsed.gapTop;
    let migratedGapBottom = parsed.gapBottom;
    if (migratedGapTop == null || migratedGapBottom == null) {
        const legacyGap = parsed.gap;
        if (legacyGap != null) {
            migratedGapTop = legacyGap;
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
