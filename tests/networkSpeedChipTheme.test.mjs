import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [speed, css, renderer] = await Promise.all([
    readFile(new URL('../modules/networkSpeed.js', import.meta.url), 'utf8'),
    readFile(new URL('../stylesheet.css', import.meta.url), 'utf8'),
    readFile(new URL('../lib/themeRenderer.js', import.meta.url), 'utf8'),
]);

test('the throughput chip has no hard width cap', () => {
    const btnBlock = css.slice(css.indexOf('.material-panel-network-speed-btn {'));
    const nextBlock = btnBlock.indexOf('}');
    assert.ok(nextBlock > 0);
    assert.doesNotMatch(btnBlock.slice(0, nextBlock), /max-width/);
});

test('the chip label follows the theme primary color', () => {
    const rates = renderer.slice(renderer.indexOf('.material-panel-net-speed-chip-rates {'));
    assert.ok(rates.includes("hex('primary'"));
    assert.match(css, /\.material-panel-net-speed-chip-rates \{[\s\S]*?color:/);
});

test('the chip label paints its accent from the live theme palette', () => {
    assert.match(speed, /import \{getThemeColor, subscribeThemeColors\} from '..\/lib\/themeColorState\.js'/);
    assert.match(speed, /const applyChipColor = \(\) => \{[\s\S]*?chipRates\.style = [\s\S]*?getThemeColor\('primary'/);
    assert.match(speed, /const unsubscribeChipColor = subscribeThemeColors\(applyChipColor\)/);
    assert.match(speed, /button\.connect\('destroy', \(\) => \{\s*unsubscribeChipColor\(\)/);
});

test('the chip stays a single-line readout', () => {
    assert.match(speed, /chipRates\.text = `↑\$\{compactRate\(upText\)\}  ↓\$\{compactRate\(downText\)\}`/);
    assert.doesNotMatch(speed, /chipUp|chipDown/);
    assert.match(speed, /chipRates\.clutter_text\.ellipsize = 0/);
});

test('throughput popup exports session totals for the network details card', () => {
    assert.match(speed, /sessionRx,\s*sessionTx,\s*updatedAt:/);
});
