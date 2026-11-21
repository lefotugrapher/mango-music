import { describe, expect, it, vi } from 'vitest';
import {
  AuthError,
  SCOPES,
  beginLogin,
  buildAuthorizeUrl,
  completeLogin,
  createTokenStore,
} from './spotifyAuth';

const NOW = 1_000_000;
const now = () => NOW;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function seedTokens(t: { accessToken: string; refreshToken: string; expiresAt: number }) {
  localStorage.setItem('pane.tokens', JSON.stringify(t));
}

function seedPkce(state = 'st') {
  sessionStorage.setItem(
    'pane.pkce',
    JSON.stringify({ verifier: 'ver', state, redirectUri: 'http://127.0.0.1:5173/', clientId: 'cid' }),
  );
}

describe('buildAuthorizeUrl', () => {
  it('carries the PKCE parameters and exact scopes', () => {
    const u = new URL(
      buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:5173/', challenge: 'chal', state: 'st' }),
    );
    expect(u.origin + u.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('code_challenge')).toBe('chal');
    expect(u.searchParams.get('scope')).toBe(SCOPES.join(' '));
  });

  it('lists the scopes from the global constraints', () => {
    expect(SCOPES.join(' ')).toBe(
      'streaming user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify user-top-read user-read-recently-played playlist-read-private playlist-read-collaborative user-follow-read',
    );
  });
});

describe('beginLogin', () => {
  it('stores the pkce record and navigates to the authorize url', async () => {
    const navigate = vi.fn();
    await beginLogin('cid', 'http://127.0.0.1:5173/', { navigate });
    const rec = JSON.parse(sessionStorage.getItem('pane.pkce') ?? 'null');
    expect(rec).toMatchObject({ redirectUri: 'http://127.0.0.1:5173/', clientId: 'cid' });
    expect(rec.verifier).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
    const url = new URL(navigate.mock.calls[0]![0] as string);
    expect(url.searchParams.get('state')).toBe(rec.state);
    expect(url.searchParams.get('client_id')).toBe('cid');
  });
});

describe('completeLogin', () => {
  it("returns 'none' with neither code nor error", async () => {
    expect(await completeLogin(new URL('http://127.0.0.1:5173/'))).toEqual({ ok: false, reason: 'none' });
  });

  it("returns 'denied' on error=access_denied", async () => {
    seedPkce();
    expect(await completeLogin(new URL('http://127.0.0.1:5173/?error=access_denied&state=st'))).toEqual({
      ok: false,
      reason: 'denied',
    });
  });

  it("returns 'state_mismatch' without calling fetch", async () => {
    seedPkce('expected');
    const fetch = vi.fn();
    const r = await completeLogin(new URL('http://127.0.0.1:5173/?code=c&state=other'), { fetch });
    expect(r).toEqual({ ok: false, reason: 'state_mismatch' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 'state_mismatch' when no pkce record exists", async () => {
    const fetch = vi.fn();
    const r = await completeLogin(new URL('http://127.0.0.1:5173/?code=c&state=x'), { fetch });
    expect(r).toEqual({ ok: false, reason: 'state_mismatch' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('exchanges the code, stores tokens and removes the pkce record', async () => {
    seedPkce();
    const fetch = vi.fn(async () => json({ access_token: 'A', refresh_token: 'R', expires_in: 3600 }));
    const r = await completeLogin(new URL('http://127.0.0.1:5173/?code=thecode&state=st'), {
      fetch: fetch as unknown as typeof globalThis.fetch,
      now,
    });
    expect(r).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://accounts.spotify.com/api/token');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      code: 'thecode',
      redirect_uri: 'http://127.0.0.1:5173/',
      client_id: 'cid',
      code_verifier: 'ver',
    });
    expect(JSON.parse(localStorage.getItem('pane.tokens')!)).toEqual({
      accessToken: 'A',
      refreshToken: 'R',
      expiresAt: NOW + 3600_000,
    });
    expect(sessionStorage.getItem('pane.pkce')).toBeNull();
  });

  it("returns 'exchange_failed' on a 400 and stores nothing", async () => {
    seedPkce();
    const fetch = vi.fn(async () => json({ error: 'invalid_grant' }, 400));
    const r = await completeLogin(new URL('http://127.0.0.1:5173/?code=c&state=st'), {
      fetch: fetch as unknown as typeof globalThis.fetch,
      now,
    });
    expect(r).toEqual({ ok: false, reason: 'exchange_failed' });
    expect(localStorage.getItem('pane.tokens')).toBeNull();
  });

  it("returns 'exchange_failed' when fetch rejects", async () => {
    seedPkce();
    const fetch = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const r = await completeLogin(new URL('http://127.0.0.1:5173/?code=c&state=st'), {
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(r).toEqual({ ok: false, reason: 'exchange_failed' });
  });
});

describe('createTokenStore', () => {
  const mk = (fetch: unknown, locks?: Parameters<typeof createTokenStore>[0]['locks']) =>
    createTokenStore({ clientId: 'cid', fetch: fetch as typeof globalThis.fetch, now, locks });

  it('get() is null when missing or malformed', () => {
    const store = mk(vi.fn());
    expect(store.get()).toBeNull();
    localStorage.setItem('pane.tokens', '{"accessToken":1}');
    expect(store.get()).toBeNull();
    localStorage.setItem('pane.tokens', 'not json');
    expect(store.get()).toBeNull();
  });

  it('returns the stored token with more than 60s left', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW + 61_000 });
    const fetch = vi.fn();
    expect(await mk(fetch).getAccessToken()).toBe('A');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes when 60s or less remain', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW + 60_000 });
    const fetch = vi.fn(async () => json({ access_token: 'B', refresh_token: 'R2', expires_in: 3600 }));
    expect(await mk(fetch).getAccessToken()).toBe('B');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://accounts.spotify.com/api/token');
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'R',
      client_id: 'cid',
    });
    expect(JSON.parse(localStorage.getItem('pane.tokens')!)).toEqual({
      accessToken: 'B',
      refreshToken: 'R2',
      expiresAt: NOW + 3600_000,
    });
  });

  it('three concurrent calls near expiry make one refresh request', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW + 1000 });
    const fetch = vi.fn(async () => json({ access_token: 'B', expires_in: 3600 }));
    const store = mk(fetch);
    const r = await Promise.all([store.getAccessToken(), store.getAccessToken(), store.getAccessToken()]);
    expect(r).toEqual(['B', 'B', 'B']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('works with a lock manager and re-reads storage inside the lock', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW + 1000 });
    const fetch = vi.fn();
    const locks = {
      request: vi.fn(async (_name: string, cb: () => Promise<unknown>) => {
        // Another tab renewed while we waited for the lock.
        seedTokens({ accessToken: 'OTHER', refreshToken: 'R3', expiresAt: NOW + 3600_000 });
        return cb();
      }),
    };
    expect(await mk(fetch, locks as never).getAccessToken()).toBe('OTHER');
    expect(locks.request).toHaveBeenCalledWith('pane.refresh', expect.any(Function));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the previous refresh token when the response has none', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'KEEP', expiresAt: NOW });
    const fetch = vi.fn(async () => json({ access_token: 'B', expires_in: 3600 }));
    await mk(fetch).getAccessToken();
    expect(mk(fetch).get()?.refreshToken).toBe('KEEP');
  });

  it('forceRefresh refreshes even when the token looks fresh', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW + 3600_000 });
    const fetch = vi.fn(async () => json({ access_token: 'B', expires_in: 3600 }));
    expect(await mk(fetch).forceRefresh()).toBe('B');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('two forceRefresh callers with the same failing token spend one refresh', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW + 3600_000 });
    const fetch = vi.fn(async () => json({ access_token: 'B', expires_in: 3600 }));
    const store = mk(fetch);
    const r = await Promise.all([store.forceRefresh(), store.forceRefresh()]);
    expect(r).toEqual(['B', 'B']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh reuses a token another tab already replaced', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW + 3600_000 });
    const fetch = vi.fn();
    const locks = {
      request: vi.fn(async (_n: string, cb: () => Promise<unknown>) => {
        seedTokens({ accessToken: 'NEW', refreshToken: 'R9', expiresAt: NOW + 3600_000 });
        return cb();
      }),
    };
    expect(await mk(fetch, locks as never).forceRefresh()).toBe('NEW');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('invalid_grant clears tokens, signals sign-out and rejects with AuthError', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW });
    const fetch = vi.fn(async () => json({ error: 'invalid_grant' }, 400));
    const store = mk(fetch);
    const cb = vi.fn();
    store.onSignedOut(cb);
    await expect(store.getAccessToken()).rejects.toBeInstanceOf(AuthError);
    expect(localStorage.getItem('pane.tokens')).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a network failure rejects with AuthError but keeps the tokens', async () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW });
    const fetch = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const store = mk(fetch);
    const cb = vi.fn();
    store.onSignedOut(cb);
    await expect(store.getAccessToken()).rejects.toBeInstanceOf(AuthError);
    expect(localStorage.getItem('pane.tokens')).not.toBeNull();
    expect(cb).not.toHaveBeenCalled();
  });

  it('rejects with AuthError when signed out', async () => {
    await expect(mk(vi.fn()).getAccessToken()).rejects.toBeInstanceOf(AuthError);
  });

  it('onSignedOut unsubscribes', () => {
    const store = mk(vi.fn());
    const cb = vi.fn();
    const off = store.onSignedOut(cb);
    off();
    store.clear();
    expect(cb).not.toHaveBeenCalled();
  });

  it('clear() removes tokens and notifies listeners', () => {
    seedTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW });
    const store = mk(vi.fn());
    const cb = vi.fn();
    store.onSignedOut(cb);
    store.clear();
    expect(localStorage.getItem('pane.tokens')).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
