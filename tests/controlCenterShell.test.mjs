import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

async function source(path) {
    return readFile(new URL(path, import.meta.url), 'utf8');
}

test('Control Center is registered as an optional built-in panel module', async () => {
    const [ids, registry, catalog, config] = await Promise.all([
        source('../lib/moduleIds.js'),
        source('../lib/moduleRegistry.js'),
        source('../prefs/moduleCatalog.js'),
        source('../lib/configStore.js'),
    ]);
    assert.match(ids, /'control-center'/);
    assert.match(registry, /import \{buildControlCenter\} from '\.\.\/modules\/controlCenter\.js'/);
    assert.match(registry, /'control-center': buildControlCenter/);
    assert.match(catalog, /id: 'control-center', name: 'Control Center'/);
    assert.doesNotMatch(config, /control-center/);
});

test('Control Center provides Home, Media and System navigation with bounded scrolling', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /const SECTIONS = \[[\s\S]*?id: 'home'[\s\S]*?id: 'media'[\s\S]*?id: 'system'/);
    assert.match(module, /new St\.ScrollView/);
    assert.match(module, /scroll\.set_policy\(St\.PolicyType\.NEVER, St\.PolicyType\.AUTOMATIC\)/);
    assert.match(module, /const maxHeight = Math\.max\(160, Math\.floor\(\(monitor\?\.height \?\? 800\) \* 0\.78\)\)/);
    assert.match(module, /function popupArrowSide\(\)/);
    assert.match(module, /return y > monitor\.y \+ monitor\.height \/ 2 \? St\.Side\.BOTTOM : St\.Side\.TOP/);
    assert.match(module, /return x > monitor\.x \+ monitor\.width \/ 2 \? St\.Side\.LEFT : St\.Side\.RIGHT/);
    assert.match(module, /navButton\.connect\('clicked', \(\) => renderSection\(section\.id\)\)/);
    assert.match(module, /can_focus: true/);
    assert.doesNotMatch(module, /spawn_command_line_sync|spawn_sync/);
});

test('Control Center Home media card owns and releases the existing compact player row', async () => {
    const [controlCenter, media] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../modules/mediaPlayer.js'),
    ]);
    assert.match(controlCenter, /buildMediaPlayerRow\(\{progress: true\}\)/);
    assert.match(controlCenter, /No media is playing/);
    assert.match(controlCenter, /mediaRow\.connect\('notify::visible'/);
    const start = media.indexOf('export function buildMediaPlayerRow(');
    const end = media.indexOf('/** Panel chip + popup controls */', start);
    const rowBuilder = media.slice(start, end);
    assert.doesNotMatch(rowBuilder, /button\.visible/);
    assert.match(rowBuilder, /row\.visible = true/);
    assert.match(rowBuilder, /row\.connect\('destroy'/);
});

test('Control Center Home reuses the existing GNOME quick-toggle backends', async () => {
    const [controlCenter, quickSettings] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../modules/quicksettings.js'),
    ]);
    assert.match(controlCenter, /darkModeTile, nightLightTile, dndTile/);
    assert.match(controlCenter, /const actions = \[darkModeTile\(\), nightLightTile\(\), dndTile\(\)\]/);
    assert.match(quickSettings, /export function darkModeTile\(\)/);
    assert.match(quickSettings, /export function nightLightTile\(\)/);
    assert.match(quickSettings, /export function dndTile\(\)/);
});

test('Control Center tears down inactive section actors and exposes Focus Mode on Home', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /function clearActors\(box\)/);
    assert.match(module, /clearActors\(page\);/);
    assert.match(module, /focusModeItem\.visible = section\.id === 'home'/);
    assert.match(module, /new PopupMenu\.PopupSwitchMenuItem\('Focus Mode', false\)/);
    assert.match(module, /config\.focusModeEnabled = enabled === true/);
    assert.match(module, /else \{\s+clearActors\(page\);\s+focusModeItem\.visible = false;/);
});

test('Control Center Media section uses a detailed MPRIS card with section-scoped progress polling', async () => {
    const [controlCenter, media] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../modules/mediaPlayer.js'),
    ]);
    assert.match(controlCenter, /buildMediaPlayerRow\(\{detailed: true\}\)/);
    assert.match(controlCenter, /section\.id === 'media'/);
    const start = media.indexOf('export function buildMediaPlayerRow(');
    const end = media.indexOf('/** Panel chip + popup controls */', start);
    const rowBuilder = media.slice(start, end);
    assert.match(rowBuilder, /detailed = false/);
    assert.match(rowBuilder, /width: detailed \? 88 : 40/);
    assert.match(rowBuilder, /onPosition: updateDetailedProgress/);
    assert.match(rowBuilder, /GLib\.timeout_add_seconds/);
    assert.match(rowBuilder, /stopPositionPolling\(\)/);
    assert.match(rowBuilder, /if \(destroyed\)/);
    assert.match(rowBuilder, /c\?\.destroy\(\)/);
    assert.match(rowBuilder, /formatMediaTime\(currentPositionUs\)/);
    assert.match(rowBuilder, /albumLabel/);
    assert.match(rowBuilder, /updatePlayerChoices\(name, players\)/);
    assert.match(rowBuilder, /playerButton\.visible = players\.length > 1/);
    assert.match(rowBuilder, /selectPreferredPlayer\?\.\(name\)/);
    assert.match(rowBuilder, /generation !== playerGeneration/);
    assert.match(rowBuilder, /isMediaVisualizerEnabled\(\)/);
    assert.match(rowBuilder, /prefersReducedMotion\(\)/);
    assert.match(rowBuilder, /notify::mapped/);
});


test('Control Center System view samples metrics only while its section actor exists', async () => {
    const [controlCenter, system, gpu] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../modules/controlCenterSystem.js'),
        source('../modules/gpu.js'),
    ]);
    assert.match(controlCenter, /buildControlCenterSystem\(\)/);
    assert.match(system, /GLib\.timeout_add_seconds/);
    assert.match(system, /root\.connect\('destroy'/);
    assert.match(system, /processCancellable\?\.cancel\(\)/);
    assert.match(system, /parseProcessSnapshot\(stdout/);
    assert.match(system, /getNetworkMetrics\(\)/);
    assert.match(system, /function readCpuUsage/);
    assert.match(system, /findTemperaturePath/);
    assert.match(system, /let gpuEnabled = false/);
    assert.match(system, /if \(gpuEnabled\)\s+refreshGpu\(\)/);
    assert.match(system, /gpuCancellable\?\.cancel\(\)/);
    assert.match(gpu, /export function readGpuInfoAsync/);
});


test('Control Center System metric helpers handle counter resets and unavailable sensors', async () => {
    const {calculateCpuPercent, parseTemperatureValue, formatNetworkRate} =
        await import('../lib/controlCenterMetrics.js');
    assert.equal(calculateCpuPercent({idle: 40, total: 100}, {idle: 50, total: 120}), 50);
    assert.equal(calculateCpuPercent(null, {idle: 50, total: 120}), null);
    assert.equal(calculateCpuPercent({idle: 40, total: 100}, {idle: 39, total: 120}), null);
    assert.equal(calculateCpuPercent({idle: 40, total: 100}, {idle: 50, total: 90}), null);
    assert.equal(parseTemperatureValue('42000'), 42);
    assert.equal(parseTemperatureValue('47'), 47);
    assert.equal(parseTemperatureValue('not-a-sensor'), null);
    assert.equal(parseTemperatureValue('190000'), null);
    assert.equal(formatNetworkRate(512), '512 B/s');
    assert.equal(formatNetworkRate(2048), '2.0 KB/s');
});


test('Control Center Home media row exposes a slim progress bar without detailed Media-only controls', async () => {
    const [controlCenter, media] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../modules/mediaPlayer.js'),
    ]);
    assert.match(controlCenter, /buildMediaPlayerRow\(\{progress: true\}\)/);
    assert.match(media, /showProgress = detailed \|\| progress/);
    assert.match(media, /width: detailed \? 88 : 40/);
    assert.match(media, /detailed \? 260 : 220/);
    assert.match(media, /if \(showProgress\)/);
    assert.match(media, /if \(progressTime\)/);
});

test('Control Center Home observes the shared Weather snapshot without polling independently', async () => {
    const [controlCenter, weather] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../modules/weather.js'),
    ]);
    assert.match(controlCenter, /watchWeatherSummary\(renderWeatherSummary\)/);
    assert.match(controlCenter, /refresh unavailable/);
    assert.match(controlCenter, /Enable Weather and configure a location/);
    assert.match(weather, /setWeatherSummary\(\{\.\.\.data, savedAt: lastSuccessAt, stale: false\}\)/);
    assert.match(weather, /stale: true/);
    assert.match(weather, /clearWeatherSummary\(\)/);
    assert.doesNotMatch(controlCenter, /fetchOpenMeteo|httpGet/);
});

test('Control Center Home uses the shared asynchronous calendar cache and releases its watcher', async () => {
    const [controlCenter, calendar] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../lib/calendarEvents.js'),
    ]);
    assert.match(controlCenter, /loadCalendarDocumentAsync\(renderCalendarSummary\)/);
    assert.match(controlCenter, /watchCalendarDocument\(\(\) =>/);
    assert.match(controlCenter, /stopCalendarWatch\(\)/);
    assert.match(controlCenter, /No upcoming timed events/);
    assert.match(controlCenter, /Calendar not synced/);
    assert.match(calendar, /export function loadCalendarDocumentAsync\(callback\)/);
    assert.match(calendar, /export function watchCalendarDocument\(callback\)/);
    assert.doesNotMatch(controlCenter, /loadCalendarDocument\(\)/);
});

test('Control Center Home reflows from a two-column bento to one column in compact popups', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /homeGrid = new St\.Widget/);
    assert.match(module, /homeLayout\.column_spacing = compact \? 0 : 10/);
    assert.match(module, /if \(compact\) \{[\s\S]*?homeLayout\.attach\(homeCard, 0, index, 1, 1\)/);
    assert.match(module, /homeLayout\.attach\(homeCards\[0\], 0, 0, 2, 1\)/);
    assert.match(module, /homeLayout\.attach\(homeCards\[1\], 0, 1, 1, 1\)/);
    assert.match(module, /homeLayout\.attach\(homeCards\[2\], 1, 1, 1, 1\)/);
    assert.match(module, /homeLayout\.attach\(homeCards\[3\], 0, 2, 1, 1\)/);
    assert.match(module, /homeLayout\.attach\(homeCards\[4\], 1, 2, 1, 1\)/);
});

test('Control Center Home reuses the System and Disk module samples for its overview', async () => {
    const [controlCenter, system, disk, extension] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../modules/controlCenterSystem.js'),
        source('../modules/disk.js'),
        source('../extension.js'),
    ]);
    assert.match(controlCenter, /watchControlCenterSummary\(renderSystemSummary\)/);
    assert.match(controlCenter, /Open System for the first CPU, memory and temperature sample/);
    assert.match(controlCenter, /Enable the Disk module for storage usage/);
    assert.match(system, /setControlCenterMetrics\(\{/);
    assert.match(disk, /setControlCenterDiskSummary\(root \?/);
    assert.match(disk, /setControlCenterDiskSummary\(null\)/);
    assert.match(extension, /clearControlCenterSummary\(\)/);
    assert.doesNotMatch(controlCenter, /readCpuUsage|readMemInfo|query_filesystem_info/);
});

test('Home system summary uses bounded usage bars and opens the detailed System section', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /new St\.Button\([\s\S]*?accessible_name = 'System overview; open detailed System view'/);
    assert.match(module, /systemSummaryCard\.connect\('clicked', \(\) => renderSection\('system'\)\)/);
    assert.match(module, /fill\.set_width\(valid \? Math\.round\(Math\.max\(0, Math\.min\(100, number\)\)\) : 0\)/);
    assert.match(module, /const diskAge = disk \? sampleAge\(disk\.sampledAt, disk\.sampledAtLabel\)/);
});

test('Home System overview uses fixed sample-time labels so last-known values do not look live', async () => {
    const [controlCenter, system, disk] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../modules/controlCenterSystem.js'),
        source('../modules/disk.js'),
    ]);
    assert.match(controlCenter, /sampleAge\(system\.sampledAt, system\.sampledAtLabel\)/);
    assert.match(controlCenter, /sampleAge\(disk\.sampledAt, disk\.sampledAtLabel\)/);
    assert.match(system, /sampledAtLabel: GLib\.DateTime\.new_now_local\(\)\.format\('%H:%M'\)/);
    assert.match(disk, /sampledAtLabel: GLib\.DateTime\.new_now_local\(\)\.format\('%H:%M'\)/);
});
