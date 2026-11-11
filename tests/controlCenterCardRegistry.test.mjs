import assert from 'node:assert/strict';
import test from 'node:test';

import {createControlCenterCardRegistry} from '../lib/controlCenterCardRegistry.js';

function definition(id = 'media', factory = () => ({destroy() {}}), overrides = {}) {
    return {
        id,
        label: id,
        sizes: ['compact', 'half', 'full'],
        defaultSize: 'half',
        factory,
        ...overrides,
    };
}

test('registers stable card metadata including optional bar chips and detail destinations', () => {
    const registry = createControlCenterCardRegistry();
    registry.register(definition('media', () => ({}), {
        barChip: {label: 'Media', icon: 'audio-x-generic-symbolic', tooltip: 'Open Media'},
        detailDestination: 'media',
    }));

    const card = registry.get('media');
    assert.equal(card.id, 'media');
    assert.deepEqual(card.sizes, ['compact', 'half', 'full']);
    assert.deepEqual(card.barChip, {
        label: 'Media',
        icon: 'audio-x-generic-symbolic',
        tooltip: 'Open Media',
    });
    assert.equal(card.detailDestination, 'media');
    assert.equal(Object.isFrozen(card), true);
    assert.equal(Object.isFrozen(card.sizes), true);
});

test('registration does not invoke factories or start card work', () => {
    const registry = createControlCenterCardRegistry();
    let builds = 0;
    registry.register(definition('weather', () => {
        builds++;
        return {};
    }));

    assert.equal(builds, 0);
    assert.equal(registry.has('weather'), true);
    assert.equal(registry.create('weather') !== null, true);
    assert.equal(builds, 1);
});

test('rejects malformed IDs, unsupported sizes, invalid destinations and factories', () => {
    const registry = createControlCenterCardRegistry();
    assert.throws(() => registry.register(definition('Media')), /stable lowercase identifier/);
    assert.throws(() => registry.register(definition('media', () => ({}), {sizes: ['huge']})), /supported sizes/);
    assert.throws(() => registry.register(definition('media', () => ({}), {defaultSize: 'huge'})), /defaultSize/);
    assert.throws(() => registry.register(definition('media', null)), /factory/);
    assert.throws(() => registry.register(definition('media', () => ({}), {
        detailDestination: '../system',
    })), /detail destination/);
    assert.throws(() => registry.register(definition('media', () => ({}), {
        barChip: {label: 'Media', icon: '/tmp/icon.svg'},
    })), /symbolic icon/);
});

test('rejects duplicate registrations without replacing the existing card', () => {
    const registry = createControlCenterCardRegistry();
    const actor = {id: 'original'};
    registry.register(definition('media', () => actor));
    assert.throws(() => registry.register(definition('media', () => ({id: 'replacement'}))), /already registered/);
    assert.equal(registry.create('media').actor, actor);
});

test('negotiates only declared sizes and falls back to the card default', () => {
    const registry = createControlCenterCardRegistry();
    registry.register(definition('weather', () => ({}), {
        sizes: ['compact', 'half'],
        defaultSize: 'compact',
    }));

    assert.equal(registry.resolveSize('weather', 'half'), 'half');
    assert.equal(registry.resolveSize('weather', 'full'), 'compact');
    assert.equal(registry.resolveSize('missing', 'full'), null);
});

test('factories receive context and return an explicitly destroyable instance', () => {
    const registry = createControlCenterCardRegistry();
    const context = {size: 'half', theme: 'dark'};
    let received = null;
    let destroyed = 0;
    registry.register(definition('calendar', value => {
        received = value;
        return {actor: {name: 'calendar'}, destroy: () => destroyed++};
    }));

    const instance = registry.create('calendar', context);
    assert.deepEqual(received, context);
    assert.equal(instance.actor.name, 'calendar');
    assert.equal(instance.destroy(), true);
    assert.equal(instance.destroy(), false);
    assert.equal(destroyed, 1);
});

test('unregister destroys every active instance and prevents further creation', () => {
    const registry = createControlCenterCardRegistry();
    let destroyed = 0;
    registry.register(definition('media', () => ({destroy: () => destroyed++})));
    const first = registry.create('media');
    const second = registry.create('media');

    assert.equal(registry.unregister('media'), true);
    assert.equal(registry.unregister('media'), false);
    assert.equal(first.destroyed, true);
    assert.equal(second.destroyed, true);
    assert.equal(destroyed, 2);
    assert.equal(registry.create('media'), null);
});

test('factory failures are isolated and reported without blocking other cards', () => {
    const errors = [];
    const registry = createControlCenterCardRegistry({
        onError: (id, error) => errors.push([id, error.message]),
    });
    registry.register(definition('broken', () => { throw new Error('factory failed'); }));
    const healthyActor = {};
    registry.register(definition('healthy', () => healthyActor));

    assert.equal(registry.create('broken'), null);
    assert.equal(registry.create('healthy').actor, healthyActor);
    assert.deepEqual(errors, [['broken', 'factory failed']]);
});

test('cleanup failures are reported without interrupting registry teardown', () => {
    const errors = [];
    const registry = createControlCenterCardRegistry({
        onError: (id, error) => errors.push([id, error.message]),
    });
    registry.register(definition('broken', () => ({actor: {}, destroy() {
        throw new Error('cleanup failed');
    }})));
    const instance = registry.create('broken');

    assert.equal(registry.unregister('broken'), true);
    assert.equal(instance.destroyed, true);
    assert.deepEqual(errors, [['broken', 'cleanup failed']]);
});

test('an old registration disposer cannot remove a newer registration with the same ID', () => {
    const registry = createControlCenterCardRegistry();
    const oldDispose = registry.register(definition('media', () => ({version: 1})));
    registry.unregister('media');
    const replacement = {version: 2};
    registry.register(definition('media', () => replacement));

    assert.equal(oldDispose(), false);
    assert.equal(registry.create('media').actor, replacement);
});

test('clear unregisters all cards and destroys their active instances', () => {
    const registry = createControlCenterCardRegistry();
    let destroyed = 0;
    registry.register(definition('media', () => ({destroy: () => destroyed++})));
    registry.register(definition('weather', () => ({destroy: () => destroyed++})));
    registry.create('media');
    registry.create('weather');

    registry.clear();
    assert.equal(registry.list().length, 0);
    assert.equal(destroyed, 2);
});
