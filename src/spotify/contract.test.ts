import { describe, expect, it } from 'vitest';
import { SpotifyError } from './contract';

describe('SpotifyError', () => {
  it('carries the HTTP status and a reason', () => {
    const err = new SpotifyError(429, 'rate_limited', 'slow down');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SpotifyError');
    expect(err.status).toBe(429);
    expect(err.reason).toBe('rate_limited');
    expect(err.message).toBe('slow down');
  });

  it('falls back to a message built from the status', () => {
    expect(new SpotifyError(500).message).toBe('Spotify request failed (500)');
  });
});
