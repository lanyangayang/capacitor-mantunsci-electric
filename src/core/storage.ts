/**
 * Token / config persistence.
 *
 * The platform's own guidance is to keep one "central controller" that owns the
 * access token. On a Capacitor app the device *is* that controller, so tokens are
 * persisted across app restarts and renewed with the refresh token.
 *
 * Ordering preference: `@capacitor/preferences` (native shared prefs / user
 * defaults, works on web too) → `localStorage` → in-memory. The dependency is
 * optional, so a bare install without the Preferences plugin still works.
 */
import { StorageMode } from './types.js';

interface KeyValueBackend {
  readonly name: StorageMode | 'none';
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const memory = new Map<string, string>();

const memoryBackend: KeyValueBackend = {
  name: 'memory',
  async get(key) {
    return memory.has(key) ? (memory.get(key) as string) : null;
  },
  async set(key, value) {
    memory.set(key, value);
  },
  async remove(key) {
    memory.delete(key);
  },
};

function localStorageBackend(): KeyValueBackend | null {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null;
    const probe = '__eop_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
  } catch {
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
async function preferencesBackend(): Promise<KeyValueBackend | null> {
  try {
    const mod = await import('@capacitor/preferences');
    const { Preferences } = mod as typeof import('@capacitor/preferences');
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
  } catch {
    return null;
  }
}

let resolved: KeyValueBackend | null = null;

export async function resolveBackend(mode: StorageMode = 'auto'): Promise<KeyValueBackend> {
  if (mode === 'memory') return memoryBackend;
  if (mode === 'localStorage') return localStorageBackend() ?? memoryBackend;
  if (mode === 'preferences') return (await preferencesBackend()) ?? memoryBackend;

  if (resolved) return resolved;
  resolved =
    (await preferencesBackend()) ??
    localStorageBackend() ??
    memoryBackend;
  return resolved;
}

/** Resets the cached backend — used by tests and after a `storage` config change. */
export function resetStorageBackend(): void {
  resolved = null;
}

export class TokenStore {
  constructor(
    private readonly backend: KeyValueBackend,
    private readonly namespace: string,
  ) {}

  private key(name: string): string {
    return `eop:${this.namespace}:${name}`;
  }

  async readTokens<T>(): Promise<T | null> {
    const raw = await this.backend.get(this.key('tokens'));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupt payload: drop it rather than crashing the app on boot.
      await this.backend.remove(this.key('tokens'));
      return null;
    }
  }

  async writeTokens(tokens: unknown): Promise<void> {
    await this.backend.set(this.key('tokens'), JSON.stringify(tokens));
  }

  async clear(): Promise<void> {
    await this.backend.remove(this.key('tokens'));
  }

  /** The backend actually in use, for diagnostics screens. */
  get backendName(): string {
    return this.backend.name;
  }
}
