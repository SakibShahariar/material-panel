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
    assert.match(speed, /const applyChipColor = \(\) => \{[\s\S]*?getThemeColor\('primary'[\s\S]*?chipRates\.style =/);
    assert.match(speed, /const unsubscribeChipColor = subscribeThemeColors\(applyChipColor\)/);
    assert.match(speed, /button\.connect\('destroy', \(\) => \{\s*unsubscribeChipColor\(\)/);
});

test('the chip stays a single-line readout', () => {
    assert.match(speed, /chipRates\.text = `↑\$\{compactRate\(upText\)\}  ↓\$\{compactRate\(downText\)\}`/);
    assert.doesNotMatch(speed, /chipUp|chipDown/);
    assert.match(speed, /chipRates\.clutter_text\.ellipsize = 0/);
});

test('the fixed-width chip centres its value with equal expanding spacers', () => {
    const box = speed.slice(speed.indexOf('const chipBox = new St.BoxLayout'),
        speed.indexOf('const button = new St.Button'));
    assert.equal((box.match(/new St\.Widget\(\{x_expand: true\}\)/g) || []).length, 2);
    assert.match(box, /chipBox\.add_child\(new St\.Widget\(\{x_expand: true\}\)\);\s*chipBox\.add_child\(chipRates\);\s*chipBox\.add_child\(new St\.Widget\(\{x_expand: true\}\)\)/);
    assert.doesNotMatch(speed, /text-align: center|line_alignment/);
});

test('the throughput chip foreground switches to on-primary while pressed', () => {
    assert.match(speed, /const foreground = chipPressed\s*\?\s*getThemeColor\('onPrimary'/);
    assert.match(speed, /button\.connect\('button-press-event'/);
    assert.match(speed, /button\.connect\('leave-event'/);
});

test('the chip has a fixed, scale-aware width so the panel does not shuffle', () => {
    assert.match(speed, /const CHIP_RATES_WIDTH = \d+/);
    assert.match(speed, /const chipWidth = Math\.round\(CHIP_RATES_WIDTH \* \(scale \|\| 1\.0\)\)/);
    assert.match(speed, /width: chipWidth/);
    assert.doesNotMatch(speed, /max-width|chipRates\.set_width/);
});

test('throughput popup exports session totals for the network details card', () => {
    assert.match(speed, /sessionRx,\s*sessionTx,\s*updatedAt:/);
});
