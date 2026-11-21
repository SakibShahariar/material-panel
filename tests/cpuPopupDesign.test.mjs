import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [cpu, popup, sparkline, stylesheet, renderer] = await Promise.all([
    readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/activityPopup.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/sparkline.js', import.meta.url), 'utf8'),
    readFile(new URL('../stylesheet.css', import.meta.url), 'utf8'),
    readFile(new URL('../lib/themeRenderer.js', import.meta.url), 'utf8'),
]);

test('CPU chip no longer builds a PopupMenu popup', () => {
    assert.doesNotMatch(cpu, /PopupMenu/);
    assert.doesNotMatch(cpu, /menuToggle/);
    assert.doesNotMatch(cpu, /attachPopupDismiss/);
    assert.match(cpu, /import \{createActivityPopup\} from '\.\.\/lib\/activityPopup\.js'/);
    assert.match(cpu, /createActivityPopup\(\{/);
    assert.match(cpu, /button\.connect\('clicked', \(\) => popup\.toggle\(\)\)/);
});

test('Activity popup never takes a global modal grab', () => {
    assert.doesNotMatch(popup, /pushModal|popModal|ActionMode\.POPUP/);
});

test('Activity popup uses the standard PopupMenu frame and dismissal manager', () => {
    assert.match(popup, /import \* as PopupMenu from 'resource:\/\/\/org\/gnome\/shell\/ui\/popupMenu\.js'/);
    assert.match(popup, /new PopupMenu\.PopupMenu\(button, 0\.5, St\.Side\.TOP\)/);
    assert.match(popup, /'material-panel-popup material-panel-activity-frame'/);
    assert.match(stylesheet, /material-panel-popup\.material-panel-activity-frame \.popup-menu-content/);
    assert.match(popup, /attachPopupDismiss\(menu, button\)/);
    assert.match(popup, /menu\.addMenuItem\(tabSection\)/);
    assert.match(popup, /menu\.addMenuItem\(contentSection\)/);
    assert.match(popup, /menu\.connect\('open-state-changed'/);
    assert.match(popup, /get isOpen\(\) \{ return !!menu\.isOpen; \}/);
    assert.doesNotMatch(popup, /global\.stage\.connect\('captured-event'/);
    assert.doesNotMatch(popup, /pushModal|popModal/);
});

test('popup surface respects the user popupOpacity setting', () => {
    assert.match(popup, /let popupOpacity = 0\.92;/);
    assert.match(popup, /const setOpacity = value =>/);
    assert.match(popup, /Math\.max\(0\.5, Math\.min\(1, n\)\)/);
    assert.match(popup, /const shaded = hexToRgba\(surface, popupOpacity\) \?\? surface;/);
    assert.match(popup, /background-color: \$\{shaded\};/);
    assert.match(popup, /setOpacity,/);
    assert.match(cpu, /popup\.setOpacity\(c\.panelSize\?\.popupOpacity\)/);
});

test('popup bars are painted from the live theme primary color', () => {
    assert.match(sparkline, /import \{getThemeColor\} from '\.\/themeColorState\.js'/);
    assert.match(sparkline, /const color = getThemeColor\('primary', '#89b4fa'\)/);
    assert.match(sparkline, /bar\.style = `background-color: \$\{color\};`/);
    assert.match(sparkline, /return \{actor, update, applyColor\}/);
    assert.match(popup, /heroBarFill\.style = `background-color: \$\{primary\};`/);
    assert.match(popup, /cpuSpark\.applyColor\(\)/);
});

test('popup surface follows the live matugen palette instead of a bundled stale color', () => {
    assert.match(popup, /import \{getThemeColor\} from '\.\/themeColorState\.js'/);
    assert.match(popup, /const surface = getThemeColor\('surface', '#1a1110'\)/);
    assert.match(popup, /root\.style = `background-color: \$\{shaded\};`/);
    assert.match(popup, /function update\(\) \{\s*applySurface\(\);/);
    assert.doesNotMatch(stylesheet, /\.material-panel-activity-popup \{[^}]*background-color: #[0-9a-f]{6}/);
});

test('popup has tabs, hero, stat cards, core tiles and a process table', () => {
    assert.match(popup, /makeTab\('overview', 'Overview'\)/);
    assert.match(popup, /makeTab\('processes', 'Processes'\)/);
    assert.match(popup, /material-panel-activity-hero-value/);
    assert.match(popup, /PERFORMANCE[\s\S]*?EFFICIENCY/);
    assert.match(popup, /material-panel-activity-core-tile/);
    assert.match(popup, /label\('Process', 'material-panel-activity-proc-col'/);
    assert.match(popup, /label\('PID', 'material-panel-activity-proc-col'/);
    assert.match(popup, /label: 'CPU%'/);
    assert.match(popup, /label: 'MEM%'/);
    for (const [name, source] of [['stylesheet', stylesheet], ['renderer', renderer]]) {
        assert.match(source, /material-panel-activity-popup/, name);
        assert.match(source, /material-panel-activity-tab\.active/, name);
        assert.match(source, /material-panel-activity-core-tile/, name);
    }
});

test('popup history uses dependency-free St bar sparklines', () => {
    assert.match(sparkline, /export function createSparkline\(/);
    assert.match(sparkline, /new St\.Widget\(/);
    assert.doesNotMatch(sparkline, /gi:\/\/cairo|imports\.cairo/);
    assert.match(popup, /import \{createSparkline\} from '\.\/sparkline\.js'/);
    assert.match(cpu, /const history = \{cpu: \[\], temp: \[\], mem: \[\]\}/);
    assert.match(cpu, /pushHistory\(totalPct, temp, memSnap\?\.usedPct \?\? null\)/);
});

test('chip sampling declares metrics before using them for memory reads', () => {
    const start = cpu.indexOf('let updateLabels = ');
    const metrics = cpu.indexOf('const metrics = activityMetrics;', start);
    const memSnap = cpu.indexOf("const memSnap = (metrics.includes('memory')", start);
    assert.ok(metrics > start && memSnap > metrics,
        'metrics must be initialized before the conditional memory read');
});

test('chip labels are populated before the actor reports as mapped', () => {
    assert.match(cpu, /let updateLabels = \(force = false\) => \{/);
    assert.match(cpu, /if \(!force && \(isSessionLocked\(\) \|\| \(!button\.mapped && !popup\.isOpen\)\)\)/);
    assert.match(cpu, /GLib\.idle_add\(GLib\.PRIORITY_DEFAULT_IDLE, \(\) => \{\s*try \{ updateLabels\(true\); \}/);
    assert.match(cpu, /button\.connect\('notify::mapped'/);
});

test('chip shows the thermometer icon with a bare temperature value', () => {
    assert.match(cpu, /tempIcon\.visible = displayedIds\.has\('temperature'\)/);
    assert.match(cpu, /cpuIcon\.visible = displayedIds\.has\('cpu'\)/);
    assert.match(cpu, /tempLabel\.text = displayed\.filter\(value => value\.id === 'temperature'\)/);
    assert.doesNotMatch(cpu, /values\.push\(\{id: 'temperature', text: 'TEMP ' /);
    assert.match(cpu, /label: 'TEMP ' \+ text/);
});
