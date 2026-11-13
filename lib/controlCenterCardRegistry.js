const VALID_ID = /^[a-z][a-z0-9-]{0,63}$/;
const VALID_SIZES = new Set(['compact', 'half', 'full']);
const VALID_ICON = /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/;

function requireText(value, field, limit) {
    if (typeof value !== 'string')
        throw new TypeError(`Card ${field} must be a string.`);
    if (!value.length || value.length > limit)
        throw new TypeError(`Card ${field} must contain 1–${limit} characters.`);
    const text = value.trim();
    if (!text)
        throw new TypeError(`Card ${field} must contain 1–${limit} characters.`);
    return text;
}

function normalizeBarChip(value) {
    if (value == null)
        return null;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('Card barChip must be an object when provided.');

    const label = requireText(value.label, 'bar-chip label', 80);
    const icon = requireText(value.icon, 'bar-chip icon', 80);
    if (!VALID_ICON.test(icon))
        throw new TypeError('Card bar-chip icon must be a symbolic icon name.');

    let tooltip = null;
    if (value.tooltip != null)
        tooltip = requireText(value.tooltip, 'bar-chip tooltip', 160);

    return Object.freeze({label, icon, tooltip});
}

function normalizeDefinition(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('Card definition must be an object.');

    const id = requireText(value.id, 'ID', 64);
    if (!VALID_ID.test(id))
        throw new TypeError('Card ID must be a stable lowercase identifier.');

    const label = requireText(value.label, 'label', 80);
    if (!Array.isArray(value.sizes) || value.sizes.length === 0 || value.sizes.length > VALID_SIZES.size ||
        value.sizes.some(size => !VALID_SIZES.has(size)) ||
        new Set(value.sizes).size !== value.sizes.length)
        throw new TypeError('Card sizes must be a non-empty list of unique supported sizes.');

    const sizes = [...value.sizes];
    const defaultSize = value.defaultSize ?? sizes[0];
    if (!sizes.includes(defaultSize))
        throw new TypeError('Card defaultSize must be one of its supported sizes.');
    if (typeof value.factory !== 'function')
        throw new TypeError('Card factory must be a function.');
    if (value.destroy != null && typeof value.destroy !== 'function')
        throw new TypeError('Card destroy hook must be a function.');

    let detailDestination = null;
    if (value.detailDestination != null) {
        detailDestination = requireText(value.detailDestination, 'detail destination', 64);
        if (!VALID_ID.test(detailDestination))
            throw new TypeError('Card detail destination must be a stable lowercase identifier.');
    }

    return Object.freeze({
        id,
        label,
        sizes: Object.freeze(sizes),
        defaultSize,
        barChip: normalizeBarChip(value.barChip),
        detailDestination,
        factory: value.factory,
        destroy: value.destroy ?? null,
    });
}

/**
 * Create an isolated registry for built-in and optional Control Center cards.
 * Registration stores metadata only; factories run exclusively when a card is
 * requested, so merely registering an optional card cannot start polling.
 */
export function createControlCenterCardRegistry({onError = null} = {}) {
    const records = new Map();

    const reportError = (id, error) => {
        try {
            onError?.(id, error);
        } catch (ignored) {}
    };

    const destroyInstance = instance => {
        if (instance.destroyed)
            return false;
        instance.destroyed = true;
        instance.record.instances.delete(instance);
        try {
            if (instance.cleanup)
                instance.cleanup();
            else if (typeof instance.actor.destroy === 'function')
                instance.actor.destroy();
        } catch (error) {
            reportError(instance.id, error);
        }
        return true;
    };

    const unregisterRecord = record => {
        if (records.get(record.definition.id) !== record)
            return false;
        records.delete(record.definition.id);
        for (const instance of [...record.instances])
            destroyInstance(instance);
        return true;
    };

    return {
        register(value) {
            const definition = normalizeDefinition(value);
            if (records.has(definition.id))
                throw new Error(`Control Center card is already registered: ${definition.id}`);

            const record = {definition, instances: new Set()};
            records.set(definition.id, record);
            let active = true;
            return () => {
                if (!active)
                    return false;
                active = false;
                return unregisterRecord(record);
            };
        },

        unregister(id) {
            const record = records.get(id);
            return record ? unregisterRecord(record) : false;
        },

        has(id) {
            return records.has(id);
        },

        get(id) {
            return records.get(id)?.definition ?? null;
        },

        list() {
            return [...records.values()].map(record => record.definition);
        },

        resolveSize(id, requestedSize) {
            const definition = records.get(id)?.definition;
            if (!definition)
                return null;
            return definition.sizes.includes(requestedSize)
                ? requestedSize
                : definition.defaultSize;
        },

        create(id, context = {}) {
            const record = records.get(id);
            if (!record)
                return null;

            let created;
            try {
                created = record.definition.factory(context);
            } catch (error) {
                reportError(id, error);
                return null;
            }
            if (!created)
                return null;

            let then;
            try {
                then = created.then;
            } catch (error) {
                reportError(id, error);
                return null;
            }
            if (typeof then === 'function') {
                // GNOME actors must be created synchronously so the host can
                // attach and own them before rendering. Observe rejected async
                // factories, and destroy any actor they resolve to so a late
                // result cannot leak watchers or other resources.
                const cleanupLateResult = value => {
                    if (!value)
                        return;
                    let actor = value;
                    let cleanup = null;
                    try {
                        const isHandle = typeof value === 'object' &&
                            Object.prototype.hasOwnProperty.call(value, 'actor');
                        if (isHandle) {
                            actor = value.actor;
                            const destroy = value.destroy;
                            if (typeof destroy === 'function')
                                cleanup = () => destroy.call(value);
                        }
                    } catch (error) {
                        reportError(id, error);
                    }
                    if (!cleanup && typeof record.definition.destroy === 'function')
                        cleanup = () => record.definition.destroy(actor, context);
                    if (!cleanup) {
                        try {
                            const destroy = actor?.destroy;
                            if (typeof destroy === 'function')
                                cleanup = () => destroy.call(actor);
                        } catch (error) {
                            reportError(id, error);
                        }
                    }
                    try { cleanup?.(); } catch (error) { reportError(id, error); }
                };
                try {
                    Promise.resolve(created).then(
                        value => cleanupLateResult(value),
                        error => reportError(id, error));
                } catch (error) {
                    reportError(id, error);
                }
                reportError(id, new TypeError('Card factories must return actors synchronously.'));
                return null;
            }

            let isHandle = false;
            try {
                isHandle = typeof created === 'object' &&
                    Object.prototype.hasOwnProperty.call(created, 'actor');
            } catch (error) {
                // Proxy descriptor traps and other introspection failures are
                // optional-card failures too; keep them from escaping the host.
                reportError(id, error);
                let cleanup = null;
                try {
                    const destroy = created?.destroy;
                    if (typeof destroy === 'function')
                        cleanup = () => destroy.call(created);
                } catch (cleanupError) {
                    reportError(id, cleanupError);
                }
                if (!cleanup && typeof record.definition.destroy === 'function')
                    cleanup = () => record.definition.destroy(null, context);
                try { cleanup?.(); } catch (cleanupError) { reportError(id, cleanupError); }
                return null;
            }
            let actor = null;
            let cleanup = null;
            const resolveCleanup = () => {
                if (isHandle) {
                    try {
                        const destroy = created.destroy;
                        if (typeof destroy === 'function')
                            return () => destroy.call(created);
                    } catch (error) {
                        reportError(id, error);
                    }
                }
                if (typeof record.definition.destroy === 'function')
                    return () => record.definition.destroy(actor, context);
                try {
                    const destroy = actor?.destroy;
                    if (typeof destroy === 'function')
                        return () => destroy.call(actor);
                } catch (error) {
                    reportError(id, error);
                }
                return null;
            };

            try {
                actor = isHandle ? created.actor : created;
            } catch (error) {
                reportError(id, error);
                cleanup = resolveCleanup();
                try { cleanup?.(); } catch (cleanupError) { reportError(id, cleanupError); }
                return null;
            }

            cleanup = resolveCleanup();
            if (!actor || (typeof actor !== 'object' && typeof actor !== 'function')) {
                reportError(id, new TypeError('Card factory must return an actor or an actor handle.'));
                try { cleanup?.(); } catch (error) { reportError(id, error); }
                return null;
            }

            // A factory may synchronously unregister or replace itself. Do not
            // retain an instance on a record that is no longer reachable.
            if (records.get(id) !== record) {
                try { cleanup?.(); } catch (error) { reportError(id, error); }
                return null;
            }

            const instance = {
                id,
                actor,
                record,
                cleanup,
                destroyed: false,
                destroy() {
                    return destroyInstance(instance);
                },
            };
            record.instances.add(instance);
            return instance;
        },

        clear() {
            for (const record of [...records.values()])
                unregisterRecord(record);
        },
    };
}
