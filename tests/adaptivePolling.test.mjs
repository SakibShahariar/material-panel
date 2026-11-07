import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createAdaptivePollSchedule} from '../lib/adaptivePolling.js';

test('adaptive polling starts at its configured base interval', () => {
    const schedule = createAdaptivePollSchedule({
        baseIntervalMs: 1000,
        maxIntervalMs: 4000,
        jitterRatio: 0,
    });
    assert.equal(schedule.nextDelay(), 1000);
    assert.equal(schedule.getIntervalMs(), 1000);
});

test('stable samples gradually lengthen the interval within its cap', () => {
    const schedule = createAdaptivePollSchedule({
        baseIntervalMs: 1000,
        maxIntervalMs: 3000,
        stableSamplesToSlow: 2,
        jitterRatio: 0,
    });
    schedule.nextDelay();
    assert.equal(schedule.getIntervalMs(), 1000);
    schedule.nextDelay();
    assert.equal(schedule.getIntervalMs(), 1500);
    schedule.nextDelay();
    schedule.nextDelay();
    assert.equal(schedule.getIntervalMs(), 2250);
    schedule.nextDelay();
    schedule.nextDelay();
    assert.equal(schedule.getIntervalMs(), 3000);
    schedule.nextDelay();
    schedule.nextDelay();
    assert.equal(schedule.getIntervalMs(), 3000);
});

test('active traffic immediately restores the base interval', () => {
    const schedule = createAdaptivePollSchedule({
        baseIntervalMs: 1000,
        maxIntervalMs: 5000,
        stableSamplesToSlow: 1,
        jitterRatio: 0,
    });
    schedule.nextDelay();
    assert.equal(schedule.getIntervalMs(), 1500);
    assert.equal(schedule.nextDelay(true), 1000);
    assert.equal(schedule.getIntervalMs(), 1000);
});

test('jitter is bounded, deterministic when injected, and never returns zero', () => {
    const low = createAdaptivePollSchedule({
        baseIntervalMs: 1000,
        jitterRatio: 0.1,
        random: () => 0,
    });
    const high = createAdaptivePollSchedule({
        baseIntervalMs: 1000,
        jitterRatio: 0.1,
        random: () => 1,
    });
    assert.equal(low.nextDelay(), 900);
    assert.equal(high.nextDelay(), 1100);
    const zero = createAdaptivePollSchedule({
        baseIntervalMs: 1,
        jitterRatio: 0.5,
        random: () => 0,
    });
    assert.equal(zero.nextDelay(), 1);
});

test('invalid timing options are normalized to safe positive bounds', () => {
    const schedule = createAdaptivePollSchedule({
        baseIntervalMs: -10,
        minIntervalMs: 0,
        maxIntervalMs: 0,
        stableSamplesToSlow: 0,
        growthFactor: 0,
        jitterRatio: 5,
        random: () => NaN,
    });
    assert.ok(schedule.nextDelay() >= 1);
    assert.ok(schedule.getIntervalMs() >= 1);
});

test('network monitor reschedules adaptively while preserving its caller base interval', async () => {
    const source = await readFile(new URL('../lib/netSpeedMonitor.js', import.meta.url), 'utf8');
    assert.match(source, /createAdaptivePollSchedule/);
    assert.match(source, /const baseIntervalMs = Math\.max\(1, Number\(intervalSec\) \|\| 1\) \* 1000/);
    assert.match(source, /GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, delayMs/);
    assert.match(source, /adaptiveSchedule\.nextDelay\(activeTraffic\)/);
    assert.match(source, /down > 0\.5 \|\| up > 0\.5/);
});

test('positive jitter only delays a fixed provider cadence and never advances it', () => {
    const earliest = createAdaptivePollSchedule({
        baseIntervalMs: 900000,
        minIntervalMs: 900000,
        maxIntervalMs: 900000,
        jitterRatio: 0.05,
        jitterMode: 'positive',
        random: () => 0,
    });
    const latest = createAdaptivePollSchedule({
        baseIntervalMs: 900000,
        minIntervalMs: 900000,
        maxIntervalMs: 900000,
        jitterRatio: 0.05,
        jitterMode: 'positive',
        random: () => 1,
    });
    assert.equal(earliest.nextDelay(), 900000);
    assert.equal(latest.nextDelay(), 945000);
});
