import assert from 'node:assert/strict';
import test from 'node:test';
import {
    signalBars,
    signalGlyph,
    sortAccessPoints,
    rateHistoryToPercent,
    parseArpNeighbors,
    parseSsProcessBandwidth,
    diffProcessBandwidth,
    classifyCaptivePortal,
    parsePingResult,
    wifiChannel,
} from '../lib/networkDesign.js';

test('signal strength maps to 0..4 bars', () => {
    assert.equal(signalBars(0), 0);
    assert.equal(signalBars(30), 2);
    assert.equal(signalBars(55), 3);
    assert.equal(signalBars(90), 4);
    assert.equal(signalGlyph(90), '▂▄▆█');
});

test('access points sort active, known, then open by strength', () => {
    const conn = uuid => ({get_uuid: () => uuid});
    const entries = [
        {ssid: 'Open', info: {strength: 95, secure: false}, connection: null},
        {ssid: 'Known', info: {strength: 40, secure: true}, connection: conn('k')},
        {ssid: 'Active', info: {strength: 20, secure: true}, connection: conn('a')},
        {ssid: 'Hidden', info: {strength: 99, secure: true}, connection: null},
    ];
    const sorted = sortAccessPoints(entries, {activeUuid: 'a', hidden: ['Hidden']});
    assert.deepEqual(sorted.map(e => e.ssid), ['Active', 'Known', 'Open']);
});

test('rate history normalizes to a rolling 0..100 scale', () => {
    const out = rateHistoryToPercent([0, 1024, 2048, NaN], {count: 4});
    assert.equal(out[0], 0);
    assert.equal(out[1], 50);
    assert.equal(out[2], 100);
    assert.ok(Number.isNaN(out[3]));
});

test('ARP neighbors parse IP and MAC, ignoring other lines', () => {
    const rows = parseArpNeighbors('192.168.0.1 dev wlp2s0 lladdr 34:e8:94:5c:5a:8f REACHABLE\nbad line');
    assert.deepEqual(rows, [{ip: '192.168.0.1', mac: '34:e8:94:5c:5a:8f'}]);
});

test('ss snapshot parsing pairs process names with byte counters', () => {
    const text = [
        'ESTAB 0 0 10.0.0.1:1 10.0.0.2:2 users:(("curl",pid=42,fd=3))',
        '\t cubic bytes_acked:100 bytes_received:200',
    ].join('\n');
    const parsed = parseSsProcessBandwidth(text);
    assert.equal(parsed.get(42).name, 'curl');
    assert.equal(parsed.get(42).acked, 100);
    assert.equal(parsed.get(42).received, 200);
});

test('ss snapshots diff into per-process rates', () => {
    const before = new Map([[1, {name: 'a', acked: 100, received: 100}]]);
    const after = new Map([[1, {name: 'a', acked: 300, received: 500}]]);
    const rows = diffProcessBandwidth(before, after, 2);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].up, 100);
    assert.equal(rows[0].down, 200);
});

test('ping output yields latency and packet loss', () => {
    const result = parsePingResult(
        '64 bytes from 1.1.1.1: icmp_seq=1 ttl=58 time=1.76 ms\n' +
        '1 packets transmitted, 1 received, 0% packet loss, time 0ms');
    assert.equal(result.latencyMs, 1.76);
    assert.equal(result.lossPercent, 0);
    assert.deepEqual(parsePingResult(''), {latencyMs: null, lossPercent: null});
});

test('access point frequency maps to a Wi-Fi channel', () => {
    assert.equal(wifiChannel(2437), 6);
    assert.equal(wifiChannel(5180), 36);
    assert.equal(wifiChannel(5955), 1);
    assert.equal(wifiChannel(0), null);
});

test('captive portal status classifies 204, redirects and failures', () => {
    assert.equal(classifyCaptivePortal(204), 'ok');
    assert.equal(classifyCaptivePortal(302), 'portal');
    assert.equal(classifyCaptivePortal(null), 'unknown');
});
