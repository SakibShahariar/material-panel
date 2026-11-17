let storageQueue = Promise.resolve();

/**
 * Serialize access to the single private clipboard-history store across
 * controller instances. A disable/re-enable transition must not let a new
 * reader race an earlier asynchronous deletion.
 */
export function enqueueClipboardHistoryStorageOperation(operation) {
    if (typeof operation !== 'function')
        return Promise.reject(new TypeError('A storage operation is required.'));

    const result = storageQueue.then(operation);
    storageQueue = result.catch(() => {});
    return result;
}
