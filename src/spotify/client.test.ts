import { describe, expect, it, vi } from 'vitest';
import { SpotifyError, createSpotifyClient } from './client';
import * as contract from './contract';

const BASE = 'https://api.spotify.com/v1';

function res(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  const init = { status, headers };
  if (status === 204) return new Response(null, init);
  return new Response(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body), init);
}

function setup(responses: Array<Response | Error | (() => Promise<Response>)>) {
  const queue = [...responses];
  const fetch = vi.fn(async (_url: unknown, _init?: unknown) => {
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected extra fetch');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  });
  const tokens = {
    getAccessToken: vi.fn(async () => 'tok'),
    forceRefresh: vi.fn(async () => 'fresh'),
  };
  const sleep = vi.fn(async (_ms: number) => {});
  const client = createSpotifyClient({ tokens, fetch: fetch as unknown as typeof globalThis.fetch, sleep });
  return { client, fetch, tokens, sleep };
}

function callOf(fetch: ReturnType<typeof setup>['fetch'], i = 0) {
  const [url, init] = fetch.mock.calls[i] as unknown as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

describe('re-exports', () => {
  it('exposes the contract error class', () => {
    expect(SpotifyError).toBe(contract.SpotifyError);
  });
});

describe('createSpotifyClient', () => {
  it('sends a bearer token and drops undefined params', async () => {
    const { client, fetch } = setup([res(200, { ok: 1 })]);
    await expect(client.get('/me/tracks', { limit: 5, offset: undefined, market: 'IE', flag: false })).resolves.toEqual({
      ok: 1,
    });
    const { url, headers, init } = callOf(fetch);
    expect(url).toBe(`${BASE}/me/tracks?limit=5&market=IE&flag=false`);
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(init.method).toBe('GET');
  });

  it('sends no query string when all params are undefined', async () => {
    const { client, fetch } = setup([res(200, {})]);
    await client.get('/me', { a: undefined });
    expect(callOf(fetch).url).toBe(`${BASE}/me`);
  });

  it('sends JSON bodies with a content type, and none without a body', async () => {
    const { client, fetch } = setup([res(204), res(204), res(204)]);
    await client.put('/me/player/play', { uris: ['a'] });
    await client.post('/me/player/next');
    await client.del('/me/tracks', { ids: ['x'] }, { market: 'IE' });
    const a = callOf(fetch, 0);
    expect(a.init.method).toBe('PUT');
    expect(a.init.body).toBe('{"uris":["a"]}');
    expect(a.headers.get('Content-Type')).toBe('application/json');
    const b = callOf(fetch, 1);
    expect(b.init.method).toBe('POST');
    expect(b.init.body).toBeUndefined();
    expect(b.headers.has('Content-Type')).toBe(false);
    const c = callOf(fetch, 2);
    expect(c.init.method).toBe('DELETE');
    expect(c.url).toBe(`${BASE}/me/tracks?market=IE`);
    expect(c.init.body).toBe('{"ids":["x"]}');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { client, fetch, tokens } = setup([res(401), res(200, { v: 1 })]);
    await expect(client.get('/me')).resolves.toEqual({ v: 1 });
    expect(tokens.forceRefresh).toHaveBeenCalledTimes(1);
    expect(callOf(fetch, 1).headers.get('Authorization')).toBe('Bearer fresh');
  });

  it('throws SpotifyError 401 after a second 401', async () => {
    const { client, tokens, fetch } = setup([res(401), res(401)]);
    await expect(client.get('/me')).rejects.toMatchObject({ name: 'SpotifyError', status: 401 });
    expect(tokens.forceRefresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('honours Retry-After on 429 and retries', async () => {
    const { client, sleep, fetch } = setup([res(429, '', { 'Retry-After': '2' }), res(200, { v: 1 })]);
    await expect(client.get('/me')).resolves.toEqual({ v: 1 });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 at most twice then throws reason 'rate_limited'", async () => {
    const r = () => res(429, '', { 'Retry-After': '1' });
    const { client, sleep, fetch } = setup([r(), r(), r()]);
    const err = await client.get('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpotifyError);
    expect(err).toMatchObject({ status: 429, reason: 'rate_limited' });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('treats a missing or unparsable Retry-After as one second', async () => {
    const { client, sleep } = setup([
      res(429),
      res(429, '', { 'Retry-After': 'soon' }),
      res(200, {}),
    ]);
    await client.get('/me');
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 1000);
  });

  it('throws at once when Retry-After is above 30', async () => {
    const { client, sleep, fetch } = setup([res(429, '', { 'Retry-After': '31' })]);
    await expect(client.get('/me')).rejects.toMatchObject({ status: 429, reason: 'rate_limited' });
    expect(sleep).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('waits for a Retry-After of exactly 30', async () => {
    const { client, sleep } = setup([res(429, '', { 'Retry-After': '30' }), res(200, {})]);
    await client.get('/me');
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("maps QUOTA_EXCEEDED 429 to reason 'quota' without retrying", async () => {
    const { client, sleep, fetch } = setup([
      res(429, { error: { status: 429, message: 'x', reason: 'QUOTA_EXCEEDED' } }, { 'Retry-After': '1' }),
    ]);
    await expect(client.get('/me')).rejects.toMatchObject({ status: 429, reason: 'quota' });
    expect(sleep).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('maps 403 and 404', async () => {
    const { client } = setup([res(403), res(404)]);
    await expect(client.get('/a')).rejects.toMatchObject({ status: 403, reason: 'forbidden' });
    await expect(client.get('/b')).rejects.toMatchObject({ status: 404, reason: 'not_found' });
  });

  it('maps other failures to a plain SpotifyError', async () => {
    const { client } = setup([res(500)]);
    const err = (await client.get('/a').catch((e: unknown) => e)) as SpotifyError;
    expect(err).toBeInstanceOf(SpotifyError);
    expect(err.status).toBe(500);
    expect(err.reason).toBeUndefined();
  });

  it("maps a rejected fetch to status 0 and reason 'network'", async () => {
    const { client } = setup([new TypeError('offline')]);
    await expect(client.get('/a')).rejects.toMatchObject({ status: 0, reason: 'network' });
  });

  it('shares one fetch between identical in-flight GETs, then fetches again', async () => {
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((r) => (release = r));
    const { client, fetch } = setup([() => gate, res(200, { n: 2 })]);
    const a = client.get('/me', { x: 1 });
    const b = client.get('/me', { x: 1 });
    await Promise.resolve();
    release(res(200, { n: 1 }));
    expect(await a).toEqual({ n: 1 });
    expect(await b).toEqual({ n: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await client.get('/me', { x: 1 })).toEqual({ n: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not share GETs with different URLs, and removes the entry after a failure', async () => {
    const { client, fetch } = setup([res(200, {}), res(200, {}), res(500), res(200, { ok: 1 })]);
    await Promise.all([client.get('/a'), client.get('/b')]);
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(client.get('/c')).rejects.toBeInstanceOf(SpotifyError);
    await expect(client.get('/c')).resolves.toEqual({ ok: 1 });
  });

  it('does not de-duplicate writes', async () => {
    const { client, fetch } = setup([res(204), res(204)]);
    await Promise.all([client.put('/x', { a: 1 }), client.put('/x', { a: 1 })]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('resolves undefined for 204 and empty 200 bodies', async () => {
    const { client } = setup([res(204), res(200, ''), res(200, ''), res(204)]);
    await expect(client.get('/a')).resolves.toBeUndefined();
    await expect(client.get('/b')).resolves.toBeUndefined();
    await expect(client.put('/c')).resolves.toBeUndefined();
    await expect(client.del('/d')).resolves.toBeUndefined();
  });

  it('raises SpotifyError for a 200 whose body is not JSON', async () => {
    const { client } = setup([res(200, '<html>')]);
    await expect(client.get('/a')).rejects.toMatchObject({ status: 200 });
  });
});
