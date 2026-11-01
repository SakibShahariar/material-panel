/**
 * Remove Material Panel's temporary shared globals during extension teardown.
 *
 * Keep this cleanup scoped to our prefix so other Shell extensions are untouched.
 */
export function clearSharedState(target = globalThis) {
    for (const key of Object.keys(target)) {
        if (key.startsWith('_materialPanel'))
            Reflect.deleteProperty(target, key);
    }
}
