/**
 * Types shared by the Web API client and everything built on it. They live
 * apart from the client implementation so the source and the player can be
 * written and tested against the contract alone.
 */

export type Params = Record<string, string | number | boolean | undefined>;

export type SpotifyErrorReason = 'rate_limited' | 'quota' | 'forbidden' | 'not_found' | 'network';

export class SpotifyError extends Error {
  readonly status: number;
  readonly reason?: SpotifyErrorReason;

  constructor(status: number, reason?: SpotifyErrorReason, message?: string) {
    super(message ?? `Spotify request failed (${status})`);
    this.name = 'SpotifyError';
    this.status = status;
    this.reason = reason;
  }
}

/** Paths are relative to https://api.spotify.com/v1 and start with a slash. */
export interface SpotifyClient {
  get<T>(path: string, params?: Params): Promise<T>;
  put(path: string, body?: unknown, params?: Params): Promise<void>;
  post(path: string, body?: unknown, params?: Params): Promise<void>;
  del(path: string, body?: unknown, params?: Params): Promise<void>;
}

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

export interface TokenStore {
  get(): Tokens | null;
  getAccessToken(): Promise<string>;
  forceRefresh(): Promise<string>;
  clear(): void;
  onSignedOut(cb: () => void): () => void;
}
