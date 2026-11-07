const TYPE_SCALE = Object.freeze({caption: 10.5, body: 12, title: 14});

export function renderDimensionsCss({scale = 1.0, gapTop = 5, gapBottom = 4, gapSide = 0, chipGap = 4, zoneScale = {}, gap, layoutStyle = 'default'} = {}) {
    // Back-compat: legacy single `gap` maps to both top/bottom
    if (gap != null && gapTop == null && gapBottom == null) {
        gapTop = gap;
        gapBottom = Math.max(0, gap - 1);
    } else {
        gapTop = gapTop ?? 5;
        gapBottom = gapBottom ?? 4;
    }
    const end4 = layoutStyle !== 'default';
    const px = n => `${Math.round(n)}px`;
    const normalizedZoneScale = {};
    for (const zone of ['left', 'center', 'right']) {
        const raw = Number(zoneScale?.[zone]);
        normalizedZoneScale[zone] = Number.isFinite(raw)
            ? Math.max(0.8, Math.min(1.2, raw))
            : 1;
    }
    const zoneMetrics = Object.fromEntries(['left', 'center', 'right'].map(zone => {
        const zoneSize = scale * normalizedZoneScale[zone];
        const zonePillHeight = 26 * zoneSize;
        return [zone, {
            scale: zoneSize,
            pillHeight: zonePillHeight,
            padV: Math.max(3, Math.round(zonePillHeight * 0.2)),
            radius: Math.round(zonePillHeight * (end4 ? 1.0 : 0.85)),
            clockFont: (zonePillHeight * 0.46).toFixed(1),
            workspaceSize: Math.round(zonePillHeight * 0.77),
            workspaceFont: (zonePillHeight * 0.4).toFixed(1),
            chipPadH: Math.max(5, Math.round(zonePillHeight * 0.32)),
        }];
    }));
    const maxZoneScale = Math.max(...Object.values(zoneMetrics).map(m => m.scale));
    const pillHeight = Math.max(...Object.values(zoneMetrics).map(m => m.pillHeight));
    // Hug corners are small; keep strut tight so windows sit closer to the bar
    const cornerExtra = end4 ? Math.max(10, Math.round(12 * maxZoneScale)) : 0;
    const barHeight = pillHeight + (end4 ? 4 : gapTop) + (end4 ? 0 : gapBottom)
        + Math.round(pillHeight * (end4 ? 0.2 : 0.4)) + cornerExtra;
    const padV = Math.max(3, Math.round(pillHeight * 0.2));
    const padH = Math.max(4, Math.round(pillHeight * 0.35));
    const padHCenter = Math.max(6, Math.round(pillHeight * 0.55));
    // end-4: fuller capsule radius
    const radius = Math.round(pillHeight * (end4 ? 1.0 : 0.85));
    const clockFont = (pillHeight * 0.46).toFixed(1);
    const workspaceSize = Math.round(pillHeight * 0.77);
    const workspaceFont = (pillHeight * 0.4).toFixed(1);
    const chipPadH = Math.max(5, Math.round(pillHeight * 0.32));
    const labelFont = (TYPE_SCALE.caption * scale).toFixed(1);
    // Space between floating zone groups (BarGroups)
    const sideMargin = end4 ? Math.max(2, Math.round(3 * scale)) : 3;
    let zoneSpacing = Number(chipGap);
    if (!Number.isFinite(zoneSpacing))
        zoneSpacing = 4;
    zoneSpacing = Math.max(0, Math.min(16, Math.round(zoneSpacing)));
    // end4 slightly airier unless user set chipGap explicitly — still respect chipGap
    if (end4 && chipGap == null)
        zoneSpacing = Math.max(4, Math.round(6 * scale));


    const zoneOverrides = ['left', 'center', 'right'].map(zone => {
        const m = zoneMetrics[zone];
        const end4VerticalPadding = Math.max(2, Math.round(m.padV * 0.4));
        const horizontal = zone === 'center' ? 8 : 6;
        const iconSize = Math.round(m.pillHeight * 0.72);
        const labelSize = (TYPE_SCALE.caption * m.scale).toFixed(1);
        return `
.material-panel-zone-${zone} {
min-height: ${px(m.pillHeight)};
spacing: ${px(zoneSpacing * normalizedZoneScale[zone])};
padding-top: ${px(end4 ? end4VerticalPadding : m.padV)};
padding-bottom: ${px(end4 ? end4VerticalPadding : m.padV)};
}
.material-panel-layout-end4 .material-panel-zone-${zone} {
min-height: ${px(m.pillHeight)};
padding: ${px(end4VerticalPadding)} ${px(horizontal)};
}
.material-panel-zone-${zone} .material-panel-chip {
padding: ${px(end4 ? end4VerticalPadding : m.padV)} ${px(m.chipPadH)};
}
.material-panel-zone-${zone} .material-panel-clock { font-size: ${m.clockFont}px; }
.material-panel-zone-${zone} .material-panel-workspace-btn {
width: ${px(m.workspaceSize)}; height: ${px(m.workspaceSize)}; font-size: ${m.workspaceFont}px;
}
.material-panel-zone-${zone} .material-panel-workspace-dot {
width: ${px(8 * m.scale)}; height: ${px(8 * m.scale)};
min-width: ${px(8 * m.scale)}; min-height: ${px(8 * m.scale)};
}
.material-panel-zone-${zone} .material-panel-workspace-dot.active {
width: ${px(10 * m.scale)}; height: ${px(10 * m.scale)};
min-width: ${px(10 * m.scale)}; min-height: ${px(10 * m.scale)};
}
.material-panel-zone-${zone} .material-panel-workspaces { spacing: ${px(6 * m.scale)}; }
.material-panel-zone-${zone} .material-panel-foreign {
height: ${px(m.pillHeight)}; min-height: ${px(m.pillHeight)};
padding: ${px(end4 ? end4VerticalPadding : m.padV)} ${px(Math.max(4, m.chipPadH * 0.6))};
border-radius: ${px(m.radius)};
}
.material-panel-zone-${zone} .material-panel-foreign StLabel,
.material-panel-zone-${zone} .material-panel-battery-label,
.material-panel-zone-${zone} .material-panel-volume-label,
.material-panel-zone-${zone} .material-panel-network-speed-label,
.material-panel-zone-${zone} .material-panel-weather-label,
.material-panel-zone-${zone} .material-panel-notifications-label,
.material-panel-zone-${zone} .material-panel-cpu-label,
.material-panel-zone-${zone} .material-panel-cpu-temp-label { font-size: ${labelSize}px; }
.material-panel-zone-${zone} .material-panel-foreign StIcon,
.material-panel-zone-${zone} .material-panel-foreign .app-menu-icon,
.material-panel-zone-${zone} .material-panel-foreign-inner StIcon,
.material-panel-zone-${zone} .material-panel-foreign StButton StIcon {
icon-size: ${px(iconSize)} !important; width: ${px(iconSize)}; height: ${px(iconSize)};
}
`;
    }).join('\n');

    return `/* Generated bar dimensions — scale=${scale} gapTop=${gapTop} gapBottom=${gapBottom} layout=${layoutStyle} */
.material-panel-bar {
height: ${px(barHeight)};
background-color: transparent;
padding: 0;
}
.material-panel-zone {
spacing: ${px(zoneSpacing)};
}
.material-panel-zone-left,
.material-panel-zone-right,
.material-panel-zone-center {
min-height: ${px(pillHeight)};
}
.material-panel-zone-left,
.material-panel-zone-right {
border-radius: ${px(radius)};
padding: ${px(padV)} ${px(padH)};
margin: ${px(gapTop)} ${px(sideMargin)} ${px(gapBottom)} ${px(sideMargin)};
}
.material-panel-zone-center {
border-radius: ${px(radius)};
padding: ${px(padV)} ${px(padHCenter)};
margin: ${px(gapTop)} ${px(sideMargin)} ${px(gapBottom)} ${px(sideMargin)};
}
/* end-4 continuous bar (Hug): full-width solid strip + corner ears below */
.material-panel-layout-end4.material-panel-bar {
background-color: transparent;
padding: 0;
spacing: 0;
}
.material-panel-bar-content-end4 {
height: ${px(pillHeight + padV * 2)};
min-height: ${px(pillHeight + padV * 2)};
padding: 0 ${px(8)};
spacing: ${px(zoneSpacing)};
}
.material-panel-layout-end4 .material-panel-zone-left,
.material-panel-layout-end4 .material-panel-zone-right,
.material-panel-layout-end4 .material-panel-zone-center {
margin: 0;
padding: ${px(2)} ${px(6)};
border-radius: ${px(Math.round(pillHeight * 0.85))};
box-shadow: none;
border: none;
background-color: transparent;
}
.material-panel-layout-end4 .material-panel-zone-center {
padding: ${px(2)} ${px(8)};
}

/* Default layout: keep right pill flush to trailing edge */
.material-panel-bar-corners {
height: ${px(Math.max(10, Math.round(12 * scale)))};
}
.material-panel-bar-corner {
background-color: transparent;
}
/* workspace dots */
.material-panel-layout-end4 .material-panel-workspaces {
spacing: 6px;
padding: 0 8px;
}
.material-panel-layout-end4 .material-panel-workspace-btn,
.material-panel-layout-end4 .material-panel-workspace-dot {
width: 8px;
height: 8px;
min-width: 8px;
min-height: 8px;
padding: 0;
margin: 0;
font-size: 0;
border-radius: 999px;
border: none;
box-shadow: none;
}
/* Empty dots only — cluster buttons size to content */
.material-panel-layout-end4 .material-panel-workspace-dot {
width: 8px;
height: 8px;
min-width: 8px;
min-height: 8px;
padding: 0;
border-radius: 999px;
}
.material-panel-layout-end4 .material-panel-workspace-dot.active {
width: 10px;
height: 10px;
min-width: 10px;
min-height: 10px;
}
.material-panel-layout-end4 .material-panel-workspace-btn.cluster {
width: auto;
height: auto;
min-width: 0;
min-height: 0;
padding: 0;
}
.material-panel-layout-end4 .material-panel-chip {
padding: ${px(Math.max(2, padV - 1))} ${px(Math.max(6, chipPadH - 2))};
}
.material-panel-layout-end4 .material-panel-clock {
font-weight: 700;
letter-spacing: 0.3px;
}

/* === end-4 QS sidebar-like card === */
.material-panel-qs-popup.material-panel-layout-end4 .popup-menu-content,
.material-panel-qs-menu.material-panel-layout-end4 .popup-menu-content {
max-width: 420px;
}
.material-panel-layout-end4 .material-panel-qs-section-sliders {
border-radius: 999px;
padding: 4px;
spacing: 0;
}
.material-panel-layout-end4 .material-panel-qs-tile {
border-radius: 18px;
min-height: 58px;
}
.material-panel-layout-end4 .material-panel-qs-tile.active {
/* primary fill already in color rules */
}
.material-panel-layout-end4 .material-panel-qs-power-btn {
border-radius: 16px;
min-width: 48px;
min-height: 48px;
}
.material-panel-layout-end4 .material-panel-qs-dual-slider {
spacing: 6px;
padding: 4px;
}
.material-panel-qs-popup.material-panel-qs-end4 .popup-menu-content,
.material-panel-qs-end4 .popup-menu-content {
max-width: 420px;
}
.material-panel-layout-end4 .material-panel-qs-tile {
border-radius: 20px;
}

.material-panel-layout-end4 .material-panel-qs-grid {
spacing: 8px;
}
/* Empty dots: hide residual glyph. App chips keep visible icons. */
.material-panel-layout-end4 .material-panel-workspace-btn:not(.app) {
font-size: 0 !important;
color: transparent;
}
.material-panel-layout-end4 .material-panel-workspace-btn.app {
font-size: inherit !important;
}
.material-panel-layout-end4 .material-panel-workspace-dot {
background-color: alpha(currentColor, 0.28);
}
.material-panel-clock {
font-size: ${clockFont}px;
}
.material-panel-workspace-btn {
width: ${px(workspaceSize)};
height: ${px(workspaceSize)};
font-size: ${workspaceFont}px;
}
.material-panel-chip {
padding: ${px(padV)} ${px(chipPadH)};
}
.material-panel-foreign {
height: ${px(pillHeight)};
min-height: ${px(pillHeight)};
padding: ${px(padV)} ${px(Math.max(4, chipPadH * 0.6))};
border-radius: ${px(radius)};
spacing: 0;
}
.material-panel-foreign StIcon,
.material-panel-foreign .app-menu-icon,
.material-panel-foreign-inner StIcon,
.material-panel-foreign StButton StIcon {
icon-size: ${px(Math.round(pillHeight * 0.72))} !important;
width: ${px(Math.round(pillHeight * 0.72))};
height: ${px(Math.round(pillHeight * 0.72))};
}
.material-panel-foreign > *,
.material-panel-foreign StBin,
.material-panel-foreign .panel-button,
.material-panel-foreign-inner {
x-align: center;
y-align: center;
}
.material-panel-foreign StLabel {
font-size: ${labelFont}px;
}
.material-panel-foreign .panel-button,
.material-panel-foreign-inner {
-natural-hpadding: 0;
-natural-vpadding: 0;
min-height: 0;
min-width: 0;
padding: 0 !important;
margin: 0 !important;
border: none !important;
background: transparent !important;
box-shadow: none !important;
}
/* AppIndicator / StatusNotifier often uses St.Bin with fixed tiny icons */
.material-panel-foreign StBin {
min-width: ${px(Math.round(pillHeight * 0.72))};
min-height: ${px(Math.round(pillHeight * 0.72))};
}
.material-panel-battery-label,
    .material-panel-volume-label,
    .material-panel-network-speed-label,
    .material-panel-weather-label,
    .material-panel-notifications-label,
    .material-panel-cpu-label,
    .material-panel-cpu-temp-label {
        font-size: ${labelFont}px;
    }
${zoneOverrides}
`;
}
