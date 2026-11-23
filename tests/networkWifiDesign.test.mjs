import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [network, speed, hidden] = await Promise.all([
    readFile(new URL('../modules/network.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/networkSpeed.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/hiddenNetworks.js', import.meta.url), 'utf8'),
]);

test('network chip shows SSID and signal glyph', () => {
    assert.match(network, /material-panel-network-chip-label/);
    assert.match(network, /signalGlyph\(info\.strength\)/);
    assert.match(network, /chipLabel\.text = info\?\.ssid/);
});

test('Wi-Fi list uses signal, grouped sorting and right-click hide', () => {
    assert.match(network, /sortAccessPoints\(visibleEntries/);
    assert.match(network, /KNOWN NETWORKS/);
    assert.match(network, /OTHER NETWORKS/);
    assert.match(network, /event\.get_button\(\) !== 3/);
    assert.match(network, /toggleHiddenNetwork\(hiddenNetworks, info\.ssid\)/);
    assert.match(network, /HIDDEN \(\$\{hiddenNetworks\.length\}\)/);
});

test('hidden networks persist to a private config file', () => {
    assert.match(hidden, /hidden-networks\.json/);
    assert.match(hidden, /export function loadHiddenNetworks/);
    assert.match(hidden, /export function saveHiddenNetworks/);
    assert.match(hidden, /export function toggleHiddenNetwork/);
});

test('adapter switcher never reuses destroyed menu items', () => {
    assert.doesNotMatch(network, /const adapterTitle = new PopupMenu\.PopupMenuItem\([^)]*\);\s*adapterSection\.addMenuItem\(adapterTitle\);/);
    const update = network.slice(network.indexOf('const updateAdapterSwitcher'));
    assert.ok(update.indexOf('adapterSection.removeAll()') > 0);
    assert.ok(update.indexOf('adapterSection.removeAll()') < update.indexOf('adapterTitle = styleMenuLabel'));
    assert.match(update.slice(0, update.indexOf('adapterSection.removeAll()')), /if \(!adapterSection\.visible\)\s*return;/);
});

test('multi-adapter switcher snaps to the radio carrying the route', () => {
    assert.match(network, /client\.get_devices\(\)\.filter\(d =>\s*d\.get_device_type\(\) === NM\.DeviceType\.WIFI\)/);
    assert.match(network, /routeIndex >= 0/);
    assert.match(network, /adapterSection\.visible = wifiDevices\.length > 1/);
});

test('captive portal and nearby devices are wired into the popup', () => {
    assert.match(network, /probeCaptivePortal\(\)/);
    assert.match(network, /classifyCaptivePortal\(code\)/);
    assert.match(network, /portalItem\.visible = classifyCaptivePortal\(code\) === 'portal'/);
    assert.match(network, /getNearbyDevices\(\)/);
    assert.match(network, /parseArpNeighbors\(text\)/);
});

test('Wi-Fi popup has connection details and quick actions', () => {
    assert.match(network, /material-panel-wifi-detail-card/);
    assert.match(network, /detailRows\.ip\.text/);
    assert.match(network, /detailRows\.gateway\.text/);
    assert.match(network, /addAction\('↻ Scan'/);
    assert.match(network, /addAction\('Settings…'/);
    assert.match(network, /updateDetails\(\)/);
});

test('network speed chip has a single-line readout and popup with graphs and processes', () => {
    assert.match(speed, /material-panel-net-speed-chip-rates/);
    assert.doesNotMatch(speed, /network-transmit-receive-symbolic/);
    assert.match(speed, /if \(firstPauseCheck\)/);
    assert.match(speed, /button\.connect\('notify::mapped'/);
    assert.doesNotMatch(speed, /chipUp|chipDown|orientation: Clutter\.Orientation\.VERTICAL,\s*style_class: 'material-panel-net-speed-chip-rates'/);
    assert.match(speed, /chipRates\.text = `↑\$\{compactRate\(upText\)\}  ↓\$\{compactRate\(downText\)\}`/);
    assert.match(speed, /createSparkline\(\{count: HISTORY_LEN/);
    assert.match(speed, /rateHistoryToPercent\(upHistory\)/);
    assert.match(speed, /diffProcessBandwidth\(procSnapshot, procSecondSnapshot/);
    assert.match(speed, /Other traffic/);
});
