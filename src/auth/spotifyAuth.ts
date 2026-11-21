import { readJSON, removeKey, writeJSON } from '../lib/storage';
import type { Tokens, TokenStore } from '../spotify/contract';
import { challengeFor, createVerifier } from './pkce';

export type { Tokens, TokenStore } from '../spotify/contract';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export const SCOPES: readonly string[] = [
  'streaming',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
  'user-top-read',
  'user-read-recently-played',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-follow-read',
];

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const TOKENS_KEY = 'pane.tokens';
const PKCE_KEY = 'pane.pkce';
const LOCK_NAME = 'pane.refresh';
const FRESH_MS = 60_000;

type PkceRecord = { verifier: string; state: string; redirectUri: string; clientId: string };

export function buildAuthorizeUrl(a: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: a.clientId,
    redirect_uri: a.redirectUri,
    scope: SCOPES.join(' '),
    state: a.state,
    code_challenge_method: 'S256',
    code_challenge: a.challenge,
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

export async function beginLogin(
  clientId: string,
  redirectUri: string,
  deps: { navigate?: (url: string) => void } = {},
): Promise<void> {
  const navigate = deps.navigate ?? ((u: string) => window.location.assign(u));
  const verifier = createVerifier();
  const state = createVerifier().slice(0, 32);
  const challenge = await challengeFor(verifier);
  const record: PkceRecord = { verifier, state, redirectUri, clientId };
  writeJSON(PKCE_KEY, record, sessionStore());
  navigate(buildAuthorizeUrl({ clientId, redirectUri, challenge, state }));
}

function sessionStore(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isPkceRecord(v: unknown): v is PkceRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.verifier === 'string' &&
    typeof r.state === 'string' &&
    typeof r.redirectUri === 'string' &&
    typeof r.clientId === 'string'
  );
}

function isTokens(v: unknown): v is Tokens {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.accessToken === 'string' &&
    t.accessToken !== '' &&
    typeof t.refreshToken === 'string' &&
    typeof t.expiresAt === 'number' &&
    Number.isFinite(t.expiresAt)
  );
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

function parseTokenResponse(v: unknown): TokenResponse | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.access_token !== 'string' || r.access_token === '') return null;
  if (typeof r.expires_in !== 'number' || !Number.isFinite(r.expires_in)) return null;
  const refresh = typeof r.refresh_token === 'string' && r.refresh_token !== '' ? r.refresh_token : undefined;
  return { access_token: r.access_token, refresh_token: refresh, expires_in: r.expires_in };
}

function postForm(fetchFn: typeof fetch, body: Record<string, string>): Promise<Response> {
  return fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'none' | 'denied' | 'state_mismatch' | 'exchange_failed' };

export async function completeLogin(
  url: URL,
  deps: { fetch?: typeof fetch; now?: () => number } = {},
): Promise<LoginResult> {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return { ok: false, reason: 'none' };

  const stored = readJSON<unknown>(PKCE_KEY, null, sessionStore());
  // The record is single-use whatever happens next: the code is too.
  removeKey(PKCE_KEY, sessionStore());

  if (error) return { ok: false, reason: 'denied' };
  if (!isPkceRecord(stored) || url.searchParams.get('state') !== stored.state) {
    return { ok: false, reason: 'state_mismatch' };
  }

  const fetchFn = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const now = deps.now ?? Date.now;
  try {
    const res = await postForm(fetchFn, {
      grant_type: 'authorization_code',
      code: code ?? '',
      redirect_uri: stored.redirectUri,
      client_id: stored.clientId,
      code_verifier: stored.verifier,
    });
    if (!res.ok) return { ok: false, reason: 'exchange_failed' };
    const parsed = parseTokenResponse(await res.json());
    if (!parsed || !parsed.refresh_token) return { ok: false, reason: 'exchange_failed' };
    writeJSON(TOKENS_KEY, {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token,
      expiresAt: now() + parsed.expires_in * 1000,
    } satisfies Tokens);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'exchange_failed' };
  }
}

export function createTokenStore(deps: {
  clientId: string;
  fetch?: typeof fetch;
  now?: () => number;
  locks?: Pick<LockManager, 'request'> | null;
}): TokenStore {
  const now = deps.now ?? Date.now;
  const listeners = new Set<() => void>();

  const locks =
    deps.locks === undefined
      ? typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks
        : null
      : deps.locks;

  // Fallback when Web Locks is missing: serialises refreshes within this tab.
  let tail: Promise<unknown> = Promise.resolve();
  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (locks) return locks.request(LOCK_NAME, fn);
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  }

  function get(): Tokens | null {
    const v = readJSON<unknown>(TOKENS_KEY, null);
    return isTokens(v) ? v : null;
  }

  function notifySignedOut() {
    for (const cb of [...listeners]) cb();
  }

  function clear() {
    removeKey(TOKENS_KEY);
    notifySignedOut();
  }

  // Another tab signing out removes the tokens from shared storage. Hearing
  // about it here lets this tab return to Setup at once, instead of every
  // screen failing its next request.
  function onStorage(e: StorageEvent) {
    const removed = e.key === TOKENS_KEY ? e.newValue === null : e.key === null && get() === null;
    if (removed) notifySignedOut();
  }

  /**
   * `failedToken` is the access token the caller saw fail. When storage holds a
   * different one, another caller or tab already refreshed and we reuse it.
   */
  function refresh(failedToken: string | null): Promise<string> {
    return withLock(async () => {
      const current = get();
      if (!current) {
        // The tokens were there when this session started, so something
        // removed them: another tab disconnected, or site data was cleared.
        notifySignedOut();
        throw new AuthError('Not signed in');
      }
      if (failedToken === null) {
        if (current.expiresAt - now() > FRESH_MS) return current.accessToken;
      } else if (current.accessToken !== failedToken) {
        return current.accessToken;
      }

      const fetchFn = deps.fetch ?? globalThis.fetch.bind(globalThis);
      let res: Response;
      try {
        res = await postForm(fetchFn, {
          grant_type: 'refresh_token',
          refresh_token: current.refreshToken,
          client_id: deps.clientId,
        });
      } catch {
        throw new AuthError('Could not reach Spotify to refresh the session');
      }

      if (!res.ok) {
        let code: unknown;
        try {
          code = ((await res.json()) as { error?: unknown } | null)?.error;
        } catch {
          code = undefined;
        }
        if (code === 'invalid_grant') {
          clear();
          throw new AuthError('Spotify session expired or was revoked');
        }
        throw new AuthError(`Token refresh failed (${res.status})`);
      }

      let parsed: TokenResponse | null;
      try {
        parsed = parseTokenResponse(await res.json());
      } catch {
        parsed = null;
      }
      if (!parsed) throw new AuthError('Token refresh returned an unexpected response');

      const next: Tokens = {
        accessToken: parsed.access_token,
        refreshToken: parsed.refresh_token ?? current.refreshToken,
        expiresAt: now() + parsed.expires_in * 1000,
      };
      writeJSON(TOKENS_KEY, next);
      return next.accessToken;
    });
  }

  return {
    get,
    getAccessToken() {
      const current = get();
      if (current && current.expiresAt - now() > FRESH_MS) return Promise.resolve(current.accessToken);
      return refresh(null);
    },
    forceRefresh() {
      return refresh(get()?.accessToken ?? '');
    },
    clear,
    onSignedOut(cb) {
      listeners.add(cb);
      if (listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },
  };
}
