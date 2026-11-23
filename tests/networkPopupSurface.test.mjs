import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/network.js', import.meta.url), 'utf8');

test('the network chip label follows the live theme palette', () => {
    assert.match(source, /import \{getThemeColor, subscribeThemeColors\} from '..\/lib\/themeColorState\.js'/);
    assert.match(source, /const applyChipColor = \(\) => \{[\s\S]*?getThemeColor\('primary'[\s\S]*?chipLabel\.style =/);
    assert.match(source, /const unsubscribeChipColor = subscribeThemeColors\(applyChipColor\)/);
    assert.match(source, /unsubscribeChipColor\(\);/);
});

test('the Wi-Fi chip uses distinct icons for on/off state, not text', () => {
    assert.match(source, /setIcon\(client\.wireless_enabled \? 'network-wifi' : 'network-offline'\)/);
    assert.match(source, /setChipA11y\(button, client\.wireless_enabled \? 'Wi-Fi on, not connected' : 'Wi-Fi off'\)/);
    assert.doesNotMatch(source, /chipLabel\.text = 'Wi-Fi (on|off)'/);
    const status = source.slice(source.indexOf('const updateStatusIcon = () => {'),
        source.indexOf("connectionStatus.text = 'Wi-Fi connected'"));
    assert.match(status, /updateChipLabel\(\)/);
});

test('the Wi-Fi popup and its lock icon follow the live theme palette', () => {
    assert.match(source, /const themedLabels = new Map\(\)/);
    assert.match(source, /label\.style = `color: \$\{getThemeColor\('onSurface'/);
    assert.match(source, /iconPathPrimary\('lock'\)/);
    assert.match(source, /unsubscribePopupColors\(\)/);
    assert.match(source, /if \(info\.secure\)\s*rowBox\.add_child\(wifiLockIcon\(\)\)/);
});

test('chip foreground switches to on-primary while pressed', () => {
    assert.match(source, /const foreground = chipPressed\s*\?\s*getThemeColor\('onPrimary'/);
    assert.match(source, /setChipPressed\(true\)/);
    assert.match(source, /button\.connect\('button-release-event'/);
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
    assert.match(source, /addDetailRow\(detailsCard, \[\{key: 'ping', label: 'PING'\}, \{key: 'loss', label: 'PACKET LOSS'}\]\)/);
    assert.match(source, /addDetailRow\(detailsCard, \[\s*\{key: 'receiving'/);
    assert.match(source, /addDetailRow\(detailsCard, \[\{key: 'ip'/);
    assert.match(source, /addDetailRow\(detailsCard, \[\{key: 'band'/);
    assert.match(source, /bandForAccessPoint\(/);
    assert.match(source, /dnsForConnection\(/);
    assert.match(source, /find_program_in_path\('omarchy\.wifiqr'\)/);
    assert.match(source, /find_program_in_path\('omarchy\.speedtest'\)/);
});

test('the Wi-Fi popup measures ping and shows device/link details', () => {
    assert.match(source, /import \{probeCaptivePortal, getNearbyDevices, probePing\}/);
    assert.match(source, /const measurePing = async \(\) => \{/);
    assert.match(source, /probePing\(gateway\)/);
    assert.match(source, /probePing\('1\.1\.1\.1'\)/);
    assert.match(source, /measurePing\(\);/);
    assert.match(source, /detailRows\.ping\.text = internet\?\.latencyMs/);
    assert.match(source, /detailRows\.loss\.text = internet\?\.lossPercent/);
    assert.match(source, /addDetailRow\(deviceCard, \[\s*\{key: 'interface'/);
    assert.match(source, /addDetailRow\(deviceCard, \[\{key: 'subnet'/);
    assert.match(source, /addDetailRow\(deviceCard, \[\s*\{key: 'link'/);
    assert.match(source, /wifiChannel\(ap\?\.get_frequency\?\.\(\)\)/);
});

test('Wi-Fi details read live throughput and session totals', () => {
    assert.match(source, /import \{getNetworkMetrics\} from '..\/lib\/systemMetricsState\.js'/);
    assert.match(source, /const metrics = getNetworkMetrics\(\) \|\| \{\}/);
    assert.match(source, /detailRows\.receiving\.text = rate\(metrics\.down\)/);
    assert.match(source, /detailRows\.downloaded\.text = total\(metrics\.sessionRx\)/);
    assert.match(source, /updateDetails\(\);/);
});
