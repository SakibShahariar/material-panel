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
    assert.match(controlCenter, /const HOME_SHORTCUT_BUILDERS = new Map/);
    assert.match(controlCenter, /\['dark-mode', darkModeTile\]/);
    assert.match(controlCenter, /\['night-light', nightLightTile\]/);
    assert.match(controlCenter, /\['dnd', dndTile\]/);
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
    assert.match(module, /else \{\s+destroyHomeCardInstances\(\);\s+clearActors\(page\);\s+focusModeItem\.visible = false;/);
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


test('Control Center Home media card links to the detailed Media section without hijacking playback controls', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /mediaOpen\.accessible_name = 'Open detailed Media section'/);
    assert.match(module, /mediaOpen\.connect\('clicked', onOpen\)/);
    assert.match(module, /factory: \(\) => buildHomeMediaCard\(\(\) => renderSection\('media'\)\)/);
    assert.match(module, /mediaHeader\.add_child\(mediaTitle\)/);
    assert.match(module, /mediaHeader\.add_child\(mediaOpen\)/);
    assert.match(module, /mediaCard\.add_child\(mediaHeader\)/);
    assert.match(module, /can_focus: true,[\s\S]*?child: new St\.Label\(\{text: 'Open Media'\}\)/);
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

test('Control Center Home uses persisted card placements and reflows to one column in compact popups', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /getControlCenterHomeGridPlacements\(\s*homeCardLayout, Object\.keys\(homeCardActors\), singleColumn\)/);
    assert.match(module, /gridLayout\.attach\(\s*homeCardActors\[placement\.id\],\s*placement\.column,\s*placement\.row,\s*placement\.columnSpan,\s*1\)/);
    assert.match(module, /const requestedSize = entry\?\.size \?\? 'half';[\s\S]*?homeCardRegistry\.resolveSize\(id, requestedSize\)[\s\S]*?applyHomeCardSize\(actor, resolvedSize\)/);
    assert.match(module, /homeGrid\.add_child\(empty\)/);
});

test('Control Center Home shortcuts are independently configurable and ordered', async () => {
    const [module, config, shortcuts] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../lib/configStore.js'),
        source('../lib/controlCenterHomeShortcuts.js'),
    ]);
    assert.match(module, /const HOME_SHORTCUT_BUILDERS = new Map/);
    assert.ok(module.includes('buildControlCenterHomeShortcutActors('));
    assert.match(shortcuts, /export function buildControlCenterHomeShortcutActors/);
    assert.match(module, /PopupSubMenuMenuItem\('Home shortcuts'/);
    assert.match(module, /setControlCenterHomeShortcut\(shortcuts, definition\.id, enabled\)/);
    assert.match(module, /moveControlCenterHomeShortcut\(shortcuts, definition\.id, -1\)/);
    assert.match(module, /moveControlCenterHomeShortcut\(shortcuts, definition\.id, 1\)/);
    assert.match(module, /config\.controlCenterHomeShortcuts = homeShortcuts/);
    assert.match(config, /controlCenterHomeShortcuts: DEFAULT_CONTROL_CENTER_HOME_SHORTCUTS/);
    assert.match(config, /normalizeControlCenterHomeShortcuts/);
    assert.match(shortcuts, /export function moveControlCenterHomeShortcut/);
});

test('Control Center Home edit mode exposes reset, reorder and supported size actions', async () => {
    const module = await source('../modules/controlCenter.js');
    const layout = await source('../lib/controlCenterHomeLayout.js');
    assert.match(module, /PopupSwitchMenuItem\('Edit Home layout', false\)/);
    assert.match(module, /homeCardsMenu\.visible = homeEditMode && currentSectionId === 'home'/);
    assert.match(module, /homeCardsMenu\.visible = section\.id === 'home' && homeEditMode/);
    assert.match(module, /PopupMenuItem\('Reset to default layout'\)/);
    assert.match(module, /PopupMenuItem\('Move up'\)/);
    assert.match(module, /PopupMenuItem\('Move down'\)/);
    assert.match(module, /setControlCenterHomeCard\(layout, definition\.id, \{size\}\)/);
    assert.match(module, /persistHomeCardVisibility\(definition\.id, enabled\)/);
    assert.match(layout, /export function moveControlCenterHomeCard/);
    assert.match(layout, /export function getControlCenterHomeGridPlacements/);
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
    assert.match(module, /systemSummaryCard\.connect\('clicked', onOpen\)/);
    assert.match(module, /factory: \(\) => buildSystemSummaryCard\(\(\) => renderSection\('system'\)\)/);
    assert.match(module, /if \(cardDestroyed\)\s+return;[\s\S]*?const system = snapshot\?\.system/);
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

test('Control Center applies compact sizing to nested clickable card surfaces', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /const content = typeof actor\.get_child === 'function' \? actor\.get_child\(\) : null/);
    assert.match(module, /const sizeTarget = content \?\? actor/);
    assert.match(module, /sizeTarget\.style = `\$\{sizeTarget\.style \?\? ''\} padding: 10px; spacing: 5px;`/);
});

test('Control Center Home card visibility is configurable for every registered built-in card', async () => {
    const [controlCenter, config, layout] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../lib/configStore.js'),
        source('../lib/controlCenterHomeLayout.js'),
    ]);
    assert.match(controlCenter, /PopupSubMenuMenuItem\('Home cards'/);
    assert.match(controlCenter, /CONTROL_CENTER_HOME_CARD_DEFINITIONS/);
    assert.match(controlCenter, /homeCardItems\.set\(definition\.id, item\)/);
    assert.match(controlCenter, /persistHomeCardVisibility\(definition\.id, enabled\)/);
    assert.match(controlCenter, /const isHomeCardVisible = id =>/);

    assert.match(controlCenter, /for \(const definition of CONTROL_CENTER_HOME_CARD_DEFINITIONS\) \{\s+if \(isHomeCardVisible\(definition\.id\)\)\s+homeCardActors\[definition\.id\] = createHomeCardActor\(definition\.id\)/);
    assert.match(controlCenter, /function buildHomeMediaCard\(onOpen\)[\s\S]*?buildMediaPlayerRow\(\{progress: true\}\)/);
    assert.match(controlCenter, /function buildHomeActionsCard\(homeShortcuts\)/);
    assert.match(controlCenter, /function buildHomeWeatherCard\(\)[\s\S]*?watchWeatherSummary/);
    assert.match(controlCenter, /cardDestroyed = true;\s+stopWeatherWatch\(\)/);
    assert.match(controlCenter, /function buildHomeCalendarCard\(\)[\s\S]*?watchCalendarDocument/);
    assert.match(controlCenter, /calendarCardDestroyed = true;\s+stopCalendarWatch\(\)/);
    assert.match(controlCenter, /function buildSystemSummaryCard\(onOpen\)/);
    assert.match(controlCenter, /watchControlCenterSummary\(renderSystemSummary\)/);
    assert.match(controlCenter, /systemSummaryCard\.connect\('clicked', onOpen\)/);
    assert.doesNotMatch(controlCenter, /actor\.destroy\(\);\s+continue;/);
    assert.match(controlCenter, /config\.controlCenterHomeLayout = homeCardLayout/);
    assert.match(controlCenter, /config\.controlCenterHomeCards = \{/);
    assert.match(controlCenter, /normalizeControlCenterHomeLayout\(\s*config\.controlCenterHomeLayout, config\.controlCenterHomeCards\)/);
    assert.match(controlCenter, /homeCardLayoutChanged \|\| destroyed/);
    assert.match(config, /controlCenterHomeLayout: DEFAULT_CONTROL_CENTER_HOME_LAYOUT/);
    assert.match(config, /normalizeControlCenterHomeLayout/);
    assert.match(layout, /id: 'weather'/);
    assert.match(layout, /id: 'calendar'/);
});


test('Control Center Home hands wallpaper browsing to Wallmat and falls back to GNOME Background', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /import Gio from 'gi:\/\/Gio'/);
    assert.match(module, /Gio\.DesktopAppInfo\.new\('dev\.sakib\.Wallmat\.desktop'\)/);
    assert.match(module, /Gio\.AppInfo\.get_all\(\)/);
    assert.match(module, /appInfo\.launch\(\[\], null\)/);
    assert.match(module, /Gio\.Subprocess\.new\(\['gnome-control-center', 'background'\], Gio\.SubprocessFlags\.NONE\)/);
    assert.match(module, /text: wallpaperApp \? 'Open Wallmat' : 'Open Background Settings'/);
    assert.match(module, /wallpaperCard\.connect\('clicked', \(\) => openWallpaperDestination\(wallpaperApp\)\)/);
    assert.match(module, /homeCardActors\[definition\.id\] = createHomeCardActor\(definition\.id\)/);
    assert.doesNotMatch(module, /spawn_command_line_sync|spawn_sync/);
});


test('Control Center derives Home grid columns from usable content width', async () => {
    const [module, layout] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../lib/controlCenterHomeLayout.js'),
    ]);
    assert.match(module, /getControlCenterHomeLayoutMode\(width\)/);
    assert.match(module, /min-width: \$\{compactNavigation \? 76 : 112\}px/);
    assert.match(module, /homeCardLayout, Object\.keys\(homeCardActors\), singleColumn\)/);
    assert.match(module, /gridLayout\.column_spacing = singleColumn \? 0 : 10/);
    assert.match(layout, /MIN_TWO_COLUMN_CONTENT_WIDTH = 340/);
});
