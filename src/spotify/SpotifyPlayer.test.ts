import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerEngine } from '../domain/types';
import { SpotifyError, type Params, type SpotifyClient } from './contract';
import type { WebPlaybackState, WebPlaybackTrack } from './raw';
import type { SdkEventMap, SdkPlayer, SdkPlayerOptions, SpotifyNamespace } from './sdk';
import { createSpotifyPlayer } from './SpotifyPlayer';

type Call = { method: 'get' | 'put' | 'post' | 'del'; path: string; params?: Params; body?: unknown };

function setup(routes: Record<string, unknown | ((c: Call) => unknown)> = {}) {
  const log: string[] = [];
  const calls: Call[] = [];
  const listeners = new Map<string, Set<(p: never) => void>>();
  let opts!: SdkPlayerOptions;
  let disconnected = 0;

  const sdkPlayer: SdkPlayer = {
    connect: async () => true,
    disconnect: () => void disconnected++,
    addListener: (event, cb) => {
      (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(cb as (p: never) => void);
      return true;
    },
    removeListener: (event, cb) => {
      if (cb) listeners.get(event)?.delete(cb as (p: never) => void);
      else listeners.delete(event);
      return true;
    },
    getCurrentState: async () => null,
    setVolume: async (v) => void log.push(`sdk:setVolume:${v}`),
    pause: async () => void log.push('sdk:pause'),
    resume: async () => void log.push('sdk:resume'),
    togglePlay: async () => void log.push('sdk:togglePlay'),
    seek: async (ms) => void log.push(`sdk:seek:${ms}`),
    previousTrack: async () => void log.push('sdk:previousTrack'),
    nextTrack: async () => void log.push('sdk:nextTrack'),
    activateElement: async () => void log.push('sdk:activateElement'),
  };
  const sdk: SpotifyNamespace = {
    Player: class {
      constructor(o: SdkPlayerOptions) {
        opts = o;
        return sdkPlayer as unknown as SdkPlayer;
      }
    } as unknown as SpotifyNamespace['Player'],
  };

  const run = async (c: Call) => {
    calls.push(c);
    log.push(`${c.method} ${c.path}`);
    const r = routes[`${c.method} ${c.path}`];
    return typeof r === 'function' ? (r as (c: Call) => unknown)(c) : r;
  };
  const client: SpotifyClient = {
    get: ((path: string, params?: Params) => run({ method: 'get', path, params })) as SpotifyClient['get'],
    put: async (path, body, params) => void (await run({ method: 'put', path, params, body })),
    post: async (path, body, params) => void (await run({ method: 'post', path, params, body })),
    del: async (path, body, params) => void (await run({ method: 'del', path, params, body })),
  };

  let token = 'tok-1';
  const player = createSpotifyPlayer({ sdk, client, getToken: async () => token, now: () => Date.now() });
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const emit = async <E extends keyof SdkEventMap>(event: E, payload: SdkEventMap[E]) => {
    listeners.get(event)?.forEach((cb) => cb(payload as never));
    await flush();
  };
  return {
    player, client, calls, log, emit, flush,
    opts: () => opts,
    disconnected: () => disconnected,
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    setToken: (t: string) => void (token = t),
  };
}

const sdkTrack = (n: number): WebPlaybackTrack => ({
  uri: `spotify:track:t${n}`, id: `t${n}`, type: 'track', name: `Song ${n}`, is_playable: true, duration_ms: 200_000,
  album: { uri: 'spotify:album:al', name: 'Album', images: [{ url: 'http://img' }] },
  artists: [{ uri: 'spotify:artist:ar', name: 'Ann' }],
});
const sdkState = (over: Partial<WebPlaybackState> = {}): WebPlaybackState => ({
  paused: false, position: 5000, duration: 200_000, repeat_mode: 0, shuffle: false,
  track_window: { current_track: sdkTrack(1), previous_tracks: [], next_tracks: [sdkTrack(2), sdkTrack(3)] },
  context: { uri: 'spotify:album:al' },
  ...over,
});

let t: ReturnType<typeof setup>;
let p: PlayerEngine;
const ready = async (id = 'dev1') => t.emit('ready', { device_id: id });
const putCalls = (path: string) => t.calls.filter((c) => c.method === 'put' && c.path === path);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  t = setup({ 'get /me/player/devices': { devices: [] } });
  p = t.player;
});
afterEach(() => {
  p.dispose();
  vi.useRealTimers();
});

describe('construction and ready', () => {
  it('creates the SDK player named Pane, supplying tokens from getToken', async () => {
    expect(t.opts().name).toBe('Pane');
    const tokens: string[] = [];
    t.opts().getOAuthToken((tok) => tokens.push(tok));
    await t.flush();
    t.setToken('tok-2');
    t.opts().getOAuthToken((tok) => tokens.push(tok));
    await t.flush();
    expect(tokens).toEqual(['tok-1', 'tok-2']);
  });

  it('starts loading with volume 0.8, then goes idle and transfers playback to itself on ready', async () => {
    expect(p.getState()).toMatchObject({ status: 'loading', volume: 0.8, track: null, error: null });
    await ready('dev1');
    expect(p.getState().status).toBe('idle');
    expect(putCalls('/me/player')).toEqual([
      expect.objectContaining({ body: { device_ids: ['dev1'], play: false } }),
    ]);
  });

  it('records an auth error if the token cannot be fetched', async () => {
    const bad = createSpotifyPlayer({
      sdk: { Player: class { constructor(o: SdkPlayerOptions) { setTimeout(() => o.getOAuthToken(() => {}), 0); } connect = async () => true; addListener() {} removeListener() {} disconnect() {} } as unknown as SpotifyNamespace['Player'] },
      client: t.client,
      getToken: async () => {
        throw new Error('nope');
      },
    });
    await t.flush();
    expect(bad.getState().error).toEqual({ kind: 'auth', message: 'Spotify sign-in expired. Connect again.' });
    bad.dispose();
  });
});

describe('player_state_changed', () => {
  it('maps SDK state into PlayerState', async () => {
    await ready();
    await t.emit('player_state_changed', sdkState({ shuffle: true, repeat_mode: 2 }));
    const s = p.getState();
    expect(s.status).toBe('playing');
    expect(s.positionMs).toBe(5000);
    expect(s.at).toBe(1_000_000);
    expect(s.track).toMatchObject({ id: 't1', name: 'Song 1', durationMs: 200_000, album: { id: 'al' }, artists: [{ id: 'ar', name: 'Ann' }] });
    expect(s.queue.map((q) => q.id)).toEqual(['t2', 't3']);
    expect(s.shuffle).toBe(true);
    expect(s.repeat).toBe('track');
  });

  it.each([[0, 'off'], [1, 'context'], [2, 'track']] as const)('repeat_mode %i is %s', async (mode, repeat) => {
    await t.emit('player_state_changed', sdkState({ repeat_mode: mode }));
    expect(p.getState().repeat).toBe(repeat);
  });

  it('paused state, with duration falling back to the state duration', async () => {
    const noDur = { ...sdkTrack(1) };
    delete noDur.duration_ms;
    await t.emit(
      'player_state_changed',
      sdkState({ paused: true, duration: 123_000, track_window: { current_track: noDur, previous_tracks: [], next_tracks: [] } }),
    );
    expect(p.getState().status).toBe('paused');
    expect(p.getState().track?.durationMs).toBe(123_000);
  });

  it('notifies subscribers and swaps the state object only on change', async () => {
    const fn = vi.fn();
    const off = p.subscribe(fn);
    const before = p.getState();
    expect(p.getState()).toBe(before);
    await t.emit('player_state_changed', sdkState());
    expect(fn).toHaveBeenCalledTimes(1);
    expect(p.getState()).not.toBe(before);
    off();
    await t.emit('player_state_changed', sdkState({ paused: true }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('with a null state, polls GET /me/player every 5s and maps a remote device', async () => {
    t = setup({
      'get /me/player': {
        device: { id: 'phone', volume_percent: 40 },
        shuffle_state: true,
        repeat_state: 'context',
        progress_ms: 7000,
        is_playing: true,
        item: { id: 'r1', uri: 'spotify:track:r1', name: 'Remote', type: 'track', duration_ms: 90_000, artists: [{ id: 'a', name: 'Ann' }], album: { id: 'x', uri: 'spotify:album:x', name: 'X' } },
      },
    });
    p = t.player;
    await ready();
    await t.emit('player_state_changed', null);
    const polls = () => t.calls.filter((c) => c.method === 'get' && c.path === '/me/player').length;
    expect(polls()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(polls()).toBe(1);
    expect(p.getState()).toMatchObject({
      status: 'playing', shuffle: true, repeat: 'context', positionMs: 7000, volume: 0.4,
      track: { id: 'r1', name: 'Remote' },
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(polls()).toBe(2);
  });

  it('a 204 poll (nothing playing) leaves an idle player with no track', async () => {
    t = setup({ 'get /me/player': undefined });
    p = t.player;
    await ready();
    await t.emit('player_state_changed', null);
    await vi.advanceTimersByTimeAsync(5000);
    expect(p.getState()).toMatchObject({ status: 'idle', track: null });
  });

  it('stops polling when a non-null state returns, and does not restart from stale responses', async () => {
    t = setup({ 'get /me/player': undefined });
    p = t.player;
    await t.emit('player_state_changed', null);
    await vi.advanceTimersByTimeAsync(5000);
    const n = () => t.calls.filter((c) => c.path === '/me/player' && c.method === 'get').length;
    expect(n()).toBe(1);
    await t.emit('player_state_changed', sdkState());
    await vi.advanceTimersByTimeAsync(20_000);
    expect(n()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a poll failure is recorded and does not stop polling', async () => {
    let fail = true;
    t = setup({
      'get /me/player': () => {
        if (fail) throw new SpotifyError(500);
        return undefined;
      },
    });
    p = t.player;
    await t.emit('player_state_changed', null);
    await vi.advanceTimersByTimeAsync(5000);
    expect(p.getState().error?.kind).toBe('playback');
    fail = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.calls.filter((c) => c.path === '/me/player' && c.method === 'get')).toHaveLength(2);
  });
});

describe('SDK errors', () => {
  it.each([
    ['account_error', 'premium_required', 'Playback needs Spotify Premium. You can still browse.'],
    ['initialization_error', 'unsupported_browser', "This browser can't play protected audio. Pick another device, or open Pane in Chrome."],
    ['authentication_error', 'auth', 'Spotify sign-in expired. Connect again.'],
  ] as const)('%s -> %s', async (event, kind, message) => {
    await t.emit(event, { message: 'raw' });
    expect(p.getState().error).toEqual({ kind, message });
    expect(p.getState().status).toBe('idle');
  });

  it('playback_error keeps the SDK message', async () => {
    await t.emit('playback_error', { message: 'Cannot load track' });
    expect(p.getState().error).toEqual({ kind: 'playback', message: 'Cannot load track' });
  });

  it('a later playback error does not hide a Premium error', async () => {
    await t.emit('account_error', { message: 'x' });
    await t.emit('playback_error', { message: 'y' });
    expect(p.getState().error?.kind).toBe('premium_required');
  });
});

describe('play', () => {
  beforeEach(async () => {
    await ready('dev1');
    t.calls.length = 0;
    t.log.length = 0;
  });

  it('context with an offset uri', async () => {
    await p.play({ contextUri: 'spotify:album:al', offsetUri: 'spotify:track:t2' });
    expect(t.calls).toEqual([
      { method: 'put', path: '/me/player/play', params: { device_id: 'dev1' }, body: { context_uri: 'spotify:album:al', offset: { uri: 'spotify:track:t2' } } },
    ]);
  });

  it('context without an offset omits it', async () => {
    await p.play({ contextUri: 'spotify:playlist:p' });
    expect(t.calls[0]?.body).toEqual({ context_uri: 'spotify:playlist:p' });
  });

  it('uris with an index', async () => {
    await p.play({ uris: ['spotify:track:a', 'spotify:track:b', 'spotify:track:c'], index: 2 });
    expect(t.calls[0]?.body).toEqual({ uris: ['spotify:track:a', 'spotify:track:b', 'spotify:track:c'], offset: { position: 2 } });
  });

  it('opts.shuffle sets shuffle before starting playback', async () => {
    await p.play({ contextUri: 'spotify:album:al' }, { shuffle: true });
    expect(t.log.filter((l) => l.startsWith('put'))).toEqual(['put /me/player/shuffle', 'put /me/player/play']);
    expect(putCalls('/me/player/shuffle')[0]?.params).toMatchObject({ state: true });
  });

  it('activates the audio element before the first request only', async () => {
    await p.play({ contextUri: 'spotify:album:al' });
    expect(t.log).toEqual(['sdk:activateElement', 'put /me/player/play']);
    t.log.length = 0;
    await p.play({ contextUri: 'spotify:album:al' });
    expect(t.log).toEqual(['put /me/player/play']);
  });
});

describe('transport', () => {
  beforeEach(async () => {
    await ready('dev1');
    t.calls.length = 0;
    t.log.length = 0;
  });

  it('uses the SDK when this browser is the active device', async () => {
    await t.emit('player_state_changed', sdkState({ position: 10_000 }));
    await p.toggle();
    await p.next();
    await p.previous();
    await p.seek(42_000);
    expect(t.log).toEqual(['sdk:togglePlay', 'sdk:nextTrack', 'sdk:previousTrack', 'sdk:seek:42000']);
    expect(t.calls).toHaveLength(0);
  });

  it('uses the Web API when another device is active', async () => {
    await t.emit('player_state_changed', null);
    await p.next();
    await p.previous();
    await p.seek(42_000);
    expect(t.log).toEqual(['post /me/player/next', 'post /me/player/previous', 'put /me/player/seek']);
    expect(t.calls[2]?.params).toMatchObject({ position_ms: 42_000 });
  });

  it('toggle on a remote device pauses or resumes through the API', async () => {
    t = setup({
      'get /me/player': { device: { id: 'phone' }, is_playing: true, item: { id: 'r', uri: 'spotify:track:r', name: 'R', type: 'track', duration_ms: 1000 }, progress_ms: 0 },
    });
    p = t.player;
    await t.emit('player_state_changed', null);
    await vi.advanceTimersByTimeAsync(5000);
    expect(p.getState().status).toBe('playing');
    await p.toggle();
    expect(t.log).toContain('put /me/player/pause');
  });

  it('setVolume updates state (clamped) and the SDK; setShuffle and setRepeat use the API', async () => {
    await p.setVolume(0.3);
    expect(p.getState().volume).toBe(0.3);
    expect(t.log).toContain('sdk:setVolume:0.3');
    await p.setVolume(7);
    expect(p.getState().volume).toBe(1);

    await p.setShuffle(true);
    await p.setRepeat('context');
    expect(putCalls('/me/player/shuffle')[0]?.params).toMatchObject({ state: true });
    expect(putCalls('/me/player/repeat')[0]?.params).toMatchObject({ state: 'context' });
    expect(p.getState()).toMatchObject({ shuffle: true, repeat: 'context' });
  });

  it('enqueue posts the uri to the queue endpoint', async () => {
    await p.enqueue('spotify:track:q1');
    expect(t.calls).toEqual([
      expect.objectContaining({ method: 'post', path: '/me/player/queue', params: { uri: 'spotify:track:q1' } }),
    ]);
  });
});

describe('devices', () => {
  it('refreshDevices maps devices and flags this browser; null ids are dropped', async () => {
    t = setup({
      'get /me/player/devices': {
        devices: [
          { id: 'dev1', is_active: true, name: 'Pane', type: 'Computer' },
          { id: 'phone', is_active: false, name: 'Phone', type: 'Smartphone' },
          { id: null, is_active: false, name: 'Restricted', type: 'Speaker' },
        ],
      },
    });
    p = t.player;
    await ready('dev1');
    await p.refreshDevices();
    expect(p.getState().devices).toEqual([
      { id: 'dev1', name: 'Pane', type: 'Computer', active: true, isThisBrowser: true },
      { id: 'phone', name: 'Phone', type: 'Smartphone', active: false, isThisBrowser: false },
    ]);
  });

  it('transfer puts exactly one device id with play true', async () => {
    t = setup({ 'get /me/player/devices': { devices: [] } });
    p = t.player;
    await p.transfer('phone');
    expect(putCalls('/me/player')[0]?.body).toEqual({ device_ids: ['phone'], play: true });
  });
});

describe('command failures', () => {
  it('a rejected command records a playback error and the promise resolves', async () => {
    t = setup({
      'put /me/player/pause': () => {
        throw new SpotifyError(404, 'not_found');
      },
      'post /me/player/next': () => {
        throw new SpotifyError(500);
      },
      'put /me/player/play': () => {
        throw new SpotifyError(403, 'forbidden');
      },
      'put /me/player/volume': () => {
        throw new SpotifyError(429, 'rate_limited');
      },
    });
    p = t.player;
    await t.emit('player_state_changed', null);
    await expect(p.next()).resolves.toBeUndefined();
    expect(p.getState().error).toMatchObject({ kind: 'playback' });
    expect(p.getState().error?.message).toBeTruthy();
    await expect(p.play({ contextUri: 'spotify:album:x' })).resolves.toBeUndefined();
    await expect(p.enqueue('spotify:track:x')).resolves.toBeUndefined();
    await expect(p.transfer('x')).resolves.toBeUndefined();
    await expect(p.seek(1)).resolves.toBeUndefined();
  });

  it('a later successful play clears a playback error', async () => {
    let fail = true;
    t = setup({
      'put /me/player/play': () => {
        if (fail) throw new SpotifyError(404);
      },
    });
    p = t.player;
    await p.play({ contextUri: 'spotify:album:x' });
    expect(p.getState().error?.kind).toBe('playback');
    fail = false;
    await p.play({ contextUri: 'spotify:album:x' });
    expect(p.getState().error).toBeNull();
  });
});

describe('dispose', () => {
  it('disconnects, removes listeners, clears the poll timer, and is idempotent', async () => {
    await t.emit('player_state_changed', null);
    await t.flush();
    expect(vi.getTimerCount()).toBe(1);
    expect(t.listenerCount()).toBeGreaterThan(0);

    p.dispose();
    p.dispose();
    expect(t.disconnected()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(t.listenerCount()).toBe(0);
  });

  it('does not notify subscribers after dispose', async () => {
    const fn = vi.fn();
    p.subscribe(fn);
    p.dispose();
    await t.emit('player_state_changed', sdkState());
    expect(fn).not.toHaveBeenCalled();
  });
});
