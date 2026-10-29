"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenStore = void 0;
exports.resolveBackend = resolveBackend;
exports.resetStorageBackend = resetStorageBackend;
const memory = new Map();
const memoryBackend = {
    name: 'memory',
    async get(key) {
        return memory.has(key) ? memory.get(key) : null;
    },
    async set(key, value) {
        memory.set(key, value);
    },
    async remove(key) {
        memory.delete(key);
    },
};
function localStorageBackend() {
    try {
        if (typeof globalThis.localStorage === 'undefined')
            return null;
        const probe = '__eop_probe__';
        globalThis.localStorage.setItem(probe, '1');
        globalThis.localStorage.removeItem(probe);
    }
    catch {
        return null;
    }
    return {
        name: 'localStorage',
        async get(key) {
            return globalThis.localStorage.getItem(key);
        },
        async set(key, value) {
            globalThis.localStorage.setItem(key, value);
        },
        async remove(key) {
            globalThis.localStorage.removeItem(key);
        },
    };
}
/** Lazily resolved so that `@capacitor/preferences` stays a true optional peer. */
async function preferencesBackend() {
    try {
        const mod = await Promise.resolve().then(() => __importStar(require('@capacitor/preferences')));
        const { Preferences } = mod;
        await Preferences.get({ key: '__eop_probe__' });
        return {
            name: 'preferences',
            async get(key) {
                const { value } = await Preferences.get({ key });
                return value ?? null;
            },
            async set(key, value) {
                await Preferences.set({ key, value });
            },
            async remove(key) {
                await Preferences.remove({ key });
            },
        };
    }
    catch {
        return null;
    }
}
let resolved = null;
async function resolveBackend(mode = 'auto') {
    if (mode === 'memory')
        return memoryBackend;
    if (mode === 'localStorage')
        return localStorageBackend() ?? memoryBackend;
    if (mode === 'preferences')
        return (await preferencesBackend()) ?? memoryBackend;
    if (resolved)
        return resolved;
    resolved =
        (await preferencesBackend()) ??
            localStorageBackend() ??
            memoryBackend;
    return resolved;
}
/** Resets the cached backend — used by tests and after a `storage` config change. */
function resetStorageBackend() {
    resolved = null;
}
class TokenStore {
    constructor(backend, namespace) {
        this.backend = backend;
        this.namespace = namespace;
    }
    key(name) {
        return `eop:${this.namespace}:${name}`;
    }
    async readTokens() {
        const raw = await this.backend.get(this.key('tokens'));
        if (!raw)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch {
            // Corrupt payload: drop it rather than crashing the app on boot.
            await this.backend.remove(this.key('tokens'));
            return null;
        }
    }
    async writeTokens(tokens) {
        await this.backend.set(this.key('tokens'), JSON.stringify(tokens));
    }
    async clear() {
        await this.backend.remove(this.key('tokens'));
    }
    /** The backend actually in use, for diagnostics screens. */
    get backendName() {
        return this.backend.name;
    }
}
exports.TokenStore = TokenStore;
//# sourceMappingURL=storage.js.map