import { describe, expect, it } from 'vitest';
import { decideBoot, noticeFor, withoutAuthParams } from './boot';
import { createUnavailablePlayer } from '../session/unavailablePlayer';

const url = (href: string) => new URL(href);

describe('decideBoot', () => {
  it('finishes a sign-in when Spotify has redirected back', () => {
    expect(decideBoot({ url: url('http://127.0.0.1:5173/?code=x&state=y'), clientId: 'c', hasTokens: false })).toBe(
      'complete_login',
    );
    expect(decideBoot({ url: url('http://127.0.0.1:5173/?error=access_denied'), clientId: 'c', hasTokens: false })).toBe(
      'complete_login',
    );
  });

  it('restores a session only when both the Client ID and tokens are stored', () => {
    expect(decideBoot({ url: url('http://127.0.0.1:5173/'), clientId: 'c', hasTokens: true })).toBe('restore');
    expect(decideBoot({ url: url('http://127.0.0.1:5173/'), clientId: null, hasTokens: true })).toBe('setup');
    expect(decideBoot({ url: url('http://127.0.0.1:5173/'), clientId: 'c', hasTokens: false })).toBe('setup');
  });

  it('ignores an unrelated query string', () => {
    expect(decideBoot({ url: url('http://127.0.0.1:5173/?utm=x'), clientId: null, hasTokens: false })).toBe('setup');
  });
});

describe('withoutAuthParams', () => {
  it('removes what Spotify appended and keeps the rest of the address', () => {
    expect(withoutAuthParams(url('http://127.0.0.1:5173/?code=abc&state=def#/library'))).toBe(
      'http://127.0.0.1:5173/#/library',
    );
    expect(withoutAuthParams(url('https://example.github.io/pane/?error=access_denied&state=s'))).toBe(
      'https://example.github.io/pane/',
    );
    expect(withoutAuthParams(url('http://127.0.0.1:5173/?keep=1&code=abc'))).toBe('http://127.0.0.1:5173/?keep=1');
  });
});

describe('noticeFor', () => {
  it('explains each way a sign-in can fail', () => {
    expect(noticeFor('denied')).toBe('Spotify sign-in was cancelled.');
    expect(noticeFor('state_mismatch')).toBe("Sign-in didn't complete. Try again.");
    expect(noticeFor('exchange_failed')).toBe("Sign-in didn't complete. Try again.");
    expect(noticeFor('signed_out')).toBe('Spotify signed you out. Connect again.');
    expect(noticeFor('forbidden')).toBe(
      "This Spotify account isn't on the app's user list. Add it under User Management in the Spotify dashboard.",
    );
  });
});

describe('createUnavailablePlayer', () => {
  it('reports why playback is unavailable and accepts every command without failing', async () => {
    const player = createUnavailablePlayer({ kind: 'unsupported_browser', message: 'No player.' });
    expect(player.getState().error).toEqual({ kind: 'unsupported_browser', message: 'No player.' });
    expect(player.getState().track).toBeNull();
    expect(player.getState()).toBe(player.getState());
    await expect(player.play({ uris: ['spotify:track:x'] })).resolves.toBeUndefined();
    await expect(player.toggle()).resolves.toBeUndefined();
    await expect(player.refreshDevices()).resolves.toBeUndefined();
    const unsubscribe = player.subscribe(() => {});
    expect(() => unsubscribe()).not.toThrow();
    expect(() => player.dispose()).not.toThrow();
  });
});
