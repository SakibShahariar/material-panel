import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8');

test('Bluetooth codec probes share a single pactl snapshot across device rows', () => {
    assert.ok(source.includes('function loadPactlCardsSnapshot()'));
    assert.ok(source.includes('if (pactlSnapshotPromise)'));
    assert.ok(source.includes("spawnCaptureAsync(['env', 'LC_ALL=C', 'pactl', 'list', 'cards'])"));
    assert.ok(source.includes('codecFromPactlText(text, address)'));
});

test('Bluetooth codec results and failed probes are cached with a bounded TTL', () => {
    assert.ok(source.includes('const CODEC_CACHE_TTL_MS = 15000'));
    assert.ok(source.includes('const PACTL_SNAPSHOT_TTL_MS = 5000'));
    assert.ok(source.includes('if (cached && now < cached.expiresAt)'));
    assert.ok(source.includes('codecCache.set(address, {codec: null, expiresAt: Date.now() + CODEC_CACHE_TTL_MS})'));
});
