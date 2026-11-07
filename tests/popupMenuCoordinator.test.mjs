import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {closeOtherPanelMenus, registerPanelMenuCloser} from '../lib/panelMenuCoordinator.js';

const popupDismiss = await readFile(new URL('../lib/popupDismiss.js', import.meta.url), 'utf8');
const shellCompat = await readFile(new URL('../lib/shellCompat.js', import.meta.url), 'utf8');

test('menu coordinator forwards the popup that must remain open', () => {
    let received = Symbol('not-called');
    const except = {id: 'current'};
    registerPanelMenuCloser(value => { received = value; });

    closeOtherPanelMenus(except);

    assert.equal(received, except);
});

test('menu coordinator safely handles an unregistered closer', () => {
    registerPanelMenuCloser(null);
    assert.doesNotThrow(() => closeOtherPanelMenus({id: 'current'}));
});

test('menu coordinator contains errors from popup cleanup', () => {
    registerPanelMenuCloser(() => { throw new Error('cleanup failed'); });
    assert.doesNotThrow(() => closeOtherPanelMenus());
    registerPanelMenuCloser(null);
});

test('popup modules coordinate through a module instead of a Shell global', () => {
    assert.ok(popupDismiss.includes('registerPanelMenuCloser(closeAllPanelMenus)'));
    assert.ok(shellCompat.includes('closeOtherPanelMenus(menu)'));
    assert.ok(!popupDismiss.includes('_materialPanelCloseAllMenus'));
    assert.ok(!shellCompat.includes('_materialPanelCloseAllMenus'));
});
