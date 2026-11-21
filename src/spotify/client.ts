import { SpotifyError } from './contract';
import type { Params, SpotifyClient, SpotifyErrorReason, TokenStore } from './contract';

export { SpotifyError } from './contract';
export type { SpotifyClient, Params } from './contract';

const BASE_URL = 'https://api.spotify.com/v1';
const MAX_RATE_RETRIES = 2;
const MAX_RETRY_AFTER_S = 30;

type Method = 'GET' | 'PUT' | 'POST' | 'DELETE';

function buildUrl(path: string, params?: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined) q.set(k, String(v));
  }
  const qs = q.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
}

function retryAfterSeconds(res: Response): number {
  const raw = res.headers.get('Retry-After');
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

function reasonFor(status: number): SpotifyErrorReason | undefined {
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  return undefined;
}

export function createSpotifyClient(deps: {
  tokens: Pick<TokenStore, 'getAccessToken' | 'forceRefresh'>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): SpotifyClient {
  const fetchFn = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const inflight = new Map<string, Promise<unknown>>();

  async function send(method: Method, url: string, body: unknown): Promise<unknown> {
    let token = await deps.tokens.getAccessToken();
    let refreshed = false;
    let rateRetries = 0;

    for (;;) {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const init: RequestInit = { method, headers };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }

      let res: Response;
      try {
        res = await fetchFn(url, init);
      } catch {
        throw new SpotifyError(0, 'network');
      }

      if (res.ok) {
        const text = await res.text();
        if (text === '') return undefined;
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new SpotifyError(res.status, undefined, 'Spotify returned an unreadable response');
        }
      }

      if (res.status === 401) {
        if (refreshed) throw new SpotifyError(401);
        refreshed = true;
        token = await deps.tokens.forceRefresh();
        continue;
      }

      if (res.status === 429) {
        const text = await res.text().catch(() => '');
        if (text.includes('QUOTA_EXCEEDED')) throw new SpotifyError(429, 'quota');
        const wait = retryAfterSeconds(res);
        if (wait > MAX_RETRY_AFTER_S || rateRetries >= MAX_RATE_RETRIES) {
          throw new SpotifyError(429, 'rate_limited');
        }
        rateRetries++;
        await sleep(wait * 1000);
        continue;
      }

      throw new SpotifyError(res.status, reasonFor(res.status));
    }
  }

  return {
    get<T>(path: string, params?: Params): Promise<T> {
      const url = buildUrl(path, params);
      const existing = inflight.get(url);
      if (existing) return existing as Promise<T>;
      const p = send('GET', url, undefined).finally(() => {
        inflight.delete(url);
      });
      inflight.set(url, p);
      return p as Promise<T>;
    },
    async put(path, body, params) {
      await send('PUT', buildUrl(path, params), body);
    },
    async post(path, body, params) {
      await send('POST', buildUrl(path, params), body);
    },
    async del(path, body, params) {
      await send('DELETE', buildUrl(path, params), body);
    },
  };
}
