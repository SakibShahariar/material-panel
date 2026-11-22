import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/network.js', import.meta.url), 'utf8');

test('the network chip label follows the live theme palette', () => {
    assert.match(source, /import \{getThemeColor\} from '..\/lib\/themeColorState\.js'/);
    assert.match(source, /chipLabel\.style = [\s\S]*?getThemeColor\('primary'/);
});

test('rebuilding the Wi-Fi list never detaches the shared popup surface', () => {
    const rebuildStart = source.indexOf('const rebuildNetworkList = () => {');
    const rebuildEnd = source.indexOf('const requestWifiScan = () => {', rebuildStart);
    assert.ok(rebuildStart >= 0 && rebuildEnd > rebuildStart);
    const rebuild = source.slice(rebuildStart, rebuildEnd);
    assert.doesNotMatch(rebuild, /networksSection\.removeAll\(\)/);
    assert.match(rebuild, /networkCards\.destroy_all_children\(\)/);
});

test('Wi-Fi popup wraps the whole surface in one scroll view', () => {
    assert.match(source, /wifiScroll\.set_child\(wifiSurface\)/);
    assert.match(source, /networkBodyItem\.add_child\(wifiScroll\)/);
    assert.doesNotMatch(source, /networkScroll\.set_child\(networkCards\)/);
});

test('Wi-Fi popup closes its settings actions through the shared helper', () => {
    assert.match(source, /import \{menuToggle, menuClose\} from '..\/lib\/shellCompat\.js'/);
    assert.match(source, /menuClose\(menu\)/);
});

test('Wi-Fi popup follows the reference hero and details-grid design', () => {
    assert.match(source, /material-panel-wifi-hero/);
    assert.match(source, /heroTitle\.text = info\?\.ssid \|\| conn\.get_id\?\.\(\)/);
    assert.match(source, /addDetailRow\(\[{key: 'ping', label: 'PING'\}, \{key: 'loss', label: 'PACKET LOSS'}\]\)/);
    assert.match(source, /addDetailRow\(\[{key: 'receiving', label: 'RECEIVING'\}, \{key: 'sending', label: 'SENDING'}\]\)/);
    assert.match(source, /addDetailRow\(\[{key: 'ip'/);
    assert.match(source, /addDetailRow\(\[{key: 'band'/);
    assert.match(source, /bandForAccessPoint\(/);
    assert.match(source, /dnsForConnection\(/);
    assert.match(source, /find_program_in_path\('omarchy\.wifiqr'\)/);
    assert.match(source, /find_program_in_path\('omarchy\.speedtest'\)/);
});

test('Wi-Fi details read live throughput and session totals', () => {
    assert.match(source, /import \{getNetworkMetrics\} from '..\/lib\/systemMetricsState\.js'/);
    assert.match(source, /const metrics = getNetworkMetrics\(\) \|\| \{\}/);
    assert.match(source, /detailRows\.receiving\.text = rate\(metrics\.down\)/);
    assert.match(source, /detailRows\.downloaded\.text = total\(metrics\.sessionRx\)/);
    assert.match(source, /updateDetails\(\);/);
});
