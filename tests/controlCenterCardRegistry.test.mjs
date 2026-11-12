import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

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

test('invalid factory handles are cleaned up instead of leaking resources', () => {
    const errors = [];
    const registry = createControlCenterCardRegistry({
        onError: (id, error) => errors.push([id, error.message]),
    });
    let destroyed = 0;
    registry.register(definition('broken', () => ({
        actor: null,
        destroy() { destroyed++; },
    })));

    assert.equal(registry.create('broken'), null);
    assert.equal(destroyed, 1);
    assert.deepEqual(errors, [['broken', 'Card factory must return an actor or an actor handle.']]);
});

test('throwing actor accessors are isolated and their factory handles are cleaned up', () => {
    const errors = [];
    const registry = createControlCenterCardRegistry({
        onError: (id, error) => errors.push([id, error.message]),
    });
    let destroyed = 0;
    const handle = {destroy() { destroyed++; }};
    Object.defineProperty(handle, 'actor', {
        get() { throw new Error('actor unavailable'); },
    });
    registry.register(definition('broken', () => handle));

    assert.doesNotThrow(() => registry.create('broken'));
    assert.equal(destroyed, 1);
    assert.deepEqual(errors, [['broken', 'actor unavailable']]);
});

test('actor cleanup remains available when an optional handle cleanup accessor fails', () => {
    const errors = [];
    const registry = createControlCenterCardRegistry({
        onError: (id, error) => errors.push([id, error.message]),
    });
    let destroyed = 0;
    const actor = {destroy() { destroyed++; }};
    const handle = {actor};
    Object.defineProperty(handle, 'destroy', {
        get() { throw new Error('cleanup accessor unavailable'); },
    });
    registry.register(definition('card', () => handle));

    const instance = registry.create('card');
    assert.ok(instance);
    assert.deepEqual(errors, [['card', 'cleanup accessor unavailable']]);
    instance.destroy();
    assert.equal(destroyed, 1);
});

test('factory results are destroyed when their registration is removed during creation', () => {
    const registry = createControlCenterCardRegistry();
    let destroyed = 0;
    registry.register(definition('media', () => {
        registry.unregister('media');
        return {destroy() { destroyed++; }};
    }));

    assert.equal(registry.create('media'), null);
    assert.equal(registry.has('media'), false);
    assert.equal(destroyed, 1);
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

test('Control Center keeps a visible fallback slot when an optional card factory fails', async () => {
    const source = await readFile(new URL('../modules/controlCenter.js', import.meta.url), 'utf8');
    assert.match(source, /function createUnavailableHomeCard\(label\)/);
    assert.match(source, /This card could not be loaded\. Other Home cards are still available\./);
    assert.match(source, /const createHomeCardActor = \(id, size\) => \{\s+const instance = homeCardRegistry\.create\(id, \{size, section: 'home'\}\)/);
    assert.match(source, /return createUnavailableHomeCard\(definition\?\.label \?\? id\)/);
    assert.match(source, /homeCardActors\[definition\.id\] = createHomeCardActor\(definition\.id, resolvedSize\)/);
});

test('Control Center creates the Wallpaper card through the registry and releases it on page changes', async () => {
    const source = await readFile(new URL('../modules/controlCenter.js', import.meta.url), 'utf8');
    assert.match(source, /createControlCenterCardRegistry/);
    assert.match(source, /const wallpaperDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /homeCardRegistry\.register\(\{[\s\S]*?\.\.\.wallpaperDefinition/);
    assert.match(source, /const createHomeCardActor = \(id, size\) => \{\s+const instance = homeCardRegistry\.create\(id, \{size, section: 'home'\}\)/);
    assert.match(source, /homeCardInstances\.set\(id, instance\)/);
    assert.match(source, /homeCardActors\[definition\.id\] = createHomeCardActor\(definition\.id, resolvedSize\)/);
    assert.match(source, /homeCardRegistry\.resolveSize\(definition\.id, requestedSize\)/);
    assert.match(source, /destroyHomeCardInstances\(\);\s*clearActors\(page\)/);
    assert.match(source, /homeCardRegistry\.clear\(\)/);
    assert.match(source, /const systemDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /detailDestination: 'system'/);
    assert.match(source, /detailDestination: 'system'/);
    assert.match(source, /const systemDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /const actionsDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /const actionsDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /const mediaDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /const mediaDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /const weatherDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /const weatherDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /const calendarDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
    assert.match(source, /const calendarDefinition = CONTROL_CENTER_HOME_CARD_DEFINITIONS\.find/);
});


test('proxy introspection failures are isolated and invoke available factory cleanup', () => {
    const errors = [];
    const registry = createControlCenterCardRegistry({
        onError: (id, error) => errors.push([id, error.message]),
    });
    let destroyed = 0;
    const handle = new Proxy({
        destroy() { destroyed++; },
    }, {
        getOwnPropertyDescriptor(target, property) {
            if (property === 'actor')
                throw new Error('actor descriptor unavailable');
            return Reflect.getOwnPropertyDescriptor(target, property);
        },
    });
    registry.register(definition('broken', () => handle));

    let instance = null;
    assert.doesNotThrow(() => { instance = registry.create('broken'); });
    assert.equal(instance, null);
    assert.equal(destroyed, 1);
    assert.deepEqual(errors, [['broken', 'actor descriptor unavailable']]);
});


test('rejects asynchronous card factories instead of returning Promises as actors', () => {
    const errors = [];
    const registry = createControlCenterCardRegistry({
        onError: (id, error) => errors.push([id, error.message]),
    });
    registry.register(definition('async', () => Promise.resolve({actor: {}})));

    assert.equal(registry.create('async'), null);
    assert.deepEqual(errors, [[
        'async',
        'Card factories must return actors synchronously.',
    ]]);
});


test('Control Center passes the resolved Home card size and section to registry factories', async () => {
    const source = await readFile(new URL('../modules/controlCenter.js', import.meta.url), 'utf8');
    assert.match(source, /const createHomeCardActor = \(id, size\) => \{\s+const instance = homeCardRegistry\.create\(id, \{size, section: 'home'\}\)/);
    assert.match(source, /const requestedSize = entry\?\.size \?\? 'half';[\s\S]*?const resolvedSize = homeCardRegistry\.resolveSize\(definition\.id, requestedSize\) \?\? requestedSize;[\s\S]*?homeCardSizes\[definition\.id\] = resolvedSize;[\s\S]*?createHomeCardActor\(definition\.id, resolvedSize\)/);
    assert.match(source, /applyHomeCardSize\(actor, homeCardSizes\[id\] \?\? 'half'\)/);
});


test('asynchronous factories clean up late actor results instead of leaking them', async () => {
    let resolveFactory;
    let actorDestroyed = 0;
    const errors = [];
    const registry = createControlCenterCardRegistry({
        onError: (_id, error) => errors.push(error),
    });
    registry.register({
        id: 'async-late',
        label: 'Async late',
        sizes: ['half'],
        factory: () => new Promise(resolve => { resolveFactory = resolve; }),
    });

    assert.equal(registry.create('async-late'), null);
    resolveFactory({destroy() { actorDestroyed++; }});
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(actorDestroyed, 1);
    assert.equal(errors.filter(error => /synchronously/.test(error.message)).length, 1);
});

test('Control Center isolates built-in card registration failures', async () => {
    const source = await readFile(new URL('../modules/controlCenter.js', import.meta.url), 'utf8');
    assert.ok(source.includes('const registerHomeCard = (definition, registration) => {'));
    assert.ok(source.includes('registration();'));
    assert.ok(source.includes('logError(error, `material-panel: Control Center card ${definition.id} registration`);'));
    for (const id of ['wallpaper', 'actions', 'media', 'weather', 'calendar', 'system'])
        assert.ok(source.includes(`registerHomeCard(${id}Definition, () => {`), `missing isolated registration for ${id}`);
    assert.match(source, /return createUnavailableHomeCard\(definition\?\.label \?\? id\)/);
});
