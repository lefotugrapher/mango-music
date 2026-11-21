/**
 * localStorage can throw (private mode, quota, blocked site data) and can hold
 * anything. These helpers never throw and never trust what they read.
 */

function defaultStore(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readJSON<T>(key: string, fallback: T, store: Storage | null = defaultStore()): T {
  try {
    const raw = store?.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown, store: Storage | null = defaultStore()): void {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing useful to do: the app keeps working from memory.
  }
}

export function removeKey(key: string, store: Storage | null = defaultStore()): void {
  try {
    store?.removeItem(key);
  } catch {
    // See writeJSON.
  }
}
