/**
 * VaultStore is a simple in-memory singleton to store the decrypted master key.
 * This key is lost when the application process restarts.
 *
 * Anchored on globalThis under a Symbol.for key so that, even when Next.js bundles
 * this module into multiple server bundles (instrumentation vs API routes in
 * standalone output), all copies resolve to the same instance — the API route
 * that unlocks the vault and the cron callback that reads it must share state.
 */
class VaultStore {
    constructor() {
        this.masterKey = null;
        this._initialized = false;
    }

    setInitialized(val) {
        this._initialized = !!val;
    }

    isInitialized() {
        return this._initialized;
    }

    setKey(key) {
        if (!Buffer.isBuffer(key) || key.length !== 32) {
            throw new Error('VaultStore: Master key must be a 32-byte Buffer');
        }
        this.masterKey = key;
    }

    getKey() {
        return this.masterKey;
    }

    clear() {
        if (this.masterKey) {
            this.masterKey.fill(0);
        }
        this.masterKey = null;
    }

    isLocked() {
        return this.masterKey === null;
    }
}

const GLOBAL_KEY = Symbol.for('nudlers.VaultStore');
if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new VaultStore();
}
const instance = globalThis[GLOBAL_KEY];
export default instance;
