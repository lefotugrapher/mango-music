import type { Device, PlayerEngine, PlayerError, PlayerState, PlayTarget, RepeatMode, Track } from '../domain/types';
import { SpotifyError, type SpotifyClient } from './contract';
import { sdkTrackToTrack, toTrack } from './mappers';
import type { RawDevices, RawPlayerResponse, WebPlaybackState } from './raw';
import type { SdkEventMap, SpotifyNamespace } from './sdk';

const DEVICE_NAME = 'Pane';
const POLL_MS = 5000;

const MESSAGES = {
  premium_required: 'Playback needs Spotify Premium. You can still browse.',
  unsupported_browser: "This browser can't play protected audio. Pick another device, or open Pane in Chrome.",
  auth: 'Spotify sign-in expired. Connect again.',
} as const;

const REPEAT_BY_SDK: RepeatMode[] = ['off', 'context', 'track'];

function describeFailure(e: unknown): string {
  if (e instanceof SpotifyError) {
    if (e.status === 404) return 'No active Spotify device. Pick a device and try again.';
    if (e.status === 403) return 'Spotify would not allow that. Playback control needs Premium.';
    if (e.status === 429) return 'Spotify is busy. Try again in a moment.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Playback failed.';
}

export function createSpotifyPlayer(deps: {
  sdk: SpotifyNamespace;
  client: SpotifyClient;
  getToken(): Promise<string>;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}): PlayerEngine {
  const { client } = deps;
  const now = deps.now ?? Date.now;
  // Resolved at call time so timers installed after construction (tests) are honoured.
  const startTimer = deps.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const stopTimer = deps.clearInterval ?? ((id) => globalThis.clearInterval(id as ReturnType<typeof setInterval>));

  const listeners = new Set<() => void>();
  const offs: (() => void)[] = [];
  let disposed = false;
  let deviceId: string | undefined;
  let rawDevices: RawDevices['devices'] | null = null;
  let sdkActive = false;
  let remoteActive = false;
  let activated = false;
  let timer: unknown;
  let pollGen = 0;

  let state: PlayerState = {
    status: 'loading', track: null, positionMs: 0, at: now(), shuffle: false, repeat: 'off',
    volume: 0.8, queue: [], devices: [], error: null,
  };

  function commit(patch: Partial<PlayerState>) {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  }

  /** A generic playback error never hides a more specific, longer-lived one. */
  function setError(error: PlayerError) {
    if (state.error && state.error.kind !== 'playback' && error.kind === 'playback') return;
    commit({ error, status: state.status === 'loading' ? 'idle' : state.status });
  }

  function mapDevices(): Device[] {
    return (rawDevices ?? [])
      .filter((d): d is typeof d & { id: string } => !!d.id)
      .map((d) => ({ id: d.id, name: d.name, type: d.type, active: d.is_active, isThisBrowser: d.id === deviceId }));
  }

  // --- SDK state ----------------------------------------------------------

  function fromSdk(st: WebPlaybackState): Partial<PlayerState> {
    const cur = st.track_window.current_track;
    const track = cur ? sdkTrackToTrack(cur, st.duration ?? 0) : null;
    return {
      status: !track ? 'idle' : st.paused ? 'paused' : 'playing',
      track,
      positionMs: st.position,
      at: now(),
      shuffle: st.shuffle,
      repeat: REPEAT_BY_SDK[st.repeat_mode] ?? 'off',
      queue: st.track_window.next_tracks.map((t) => sdkTrackToTrack(t, 0)),
    };
  }

  function fromRemote(r: RawPlayerResponse | undefined): void {
    const thisBrowser = r?.device?.id === deviceId;
    remoteActive = !!r?.device?.id && !thisBrowser;
    if (!r) {
      if (state.track || state.status === 'playing' || state.status === 'paused') {
        commit({ status: 'idle', track: null, positionMs: 0, at: now(), queue: [] });
      }
      return;
    }
    const track: Track | null = toTrack(r.item);
    const volume = r.device?.volume_percent;
    commit({
      status: !track ? 'idle' : r.is_playing ? 'playing' : 'paused',
      track,
      positionMs: r.progress_ms ?? 0,
      at: now(),
      shuffle: r.shuffle_state ?? false,
      repeat: r.repeat_state === 'track' || r.repeat_state === 'context' ? r.repeat_state : 'off',
      queue: [],
      ...(typeof volume === 'number' ? { volume: Math.min(Math.max(volume / 100, 0), 1) } : {}),
    });
  }

  async function poll() {
    const gen = pollGen;
    let r: RawPlayerResponse | undefined;
    try {
      r = await client.get<RawPlayerResponse | undefined>('/me/player');
    } catch (e) {
      if (gen === pollGen) setError({ kind: 'playback', message: describeFailure(e) });
      return;
    }
    if (gen === pollGen) fromRemote(r ?? undefined);
  }

  function startPolling() {
    if (timer === undefined && !disposed) timer = startTimer(() => void poll(), POLL_MS);
  }
  function stopPolling() {
    pollGen++;
    if (timer !== undefined) stopTimer(timer);
    timer = undefined;
  }

  // --- commands -----------------------------------------------------------

  /** Commands never reject: a failure becomes `state.error`. */
  async function cmd(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      if (state.error?.kind === 'playback') commit({ error: null });
    } catch (e) {
      setError({ kind: 'playback', message: describeFailure(e) });
    }
  }

  const sdkPlayer = new deps.sdk.Player({
    name: DEVICE_NAME,
    volume: state.volume,
    getOAuthToken: (cb) => {
      deps.getToken().then(cb, () => setError({ kind: 'auth', message: MESSAGES.auth }));
    },
  });

  function on<E extends keyof SdkEventMap>(event: E, cb: (payload: SdkEventMap[E]) => void) {
    sdkPlayer.addListener(event, cb);
    offs.push(() => sdkPlayer.removeListener(event, cb));
  }

  on('ready', ({ device_id }) => {
    deviceId = device_id;
    commit({ status: state.status === 'loading' ? 'idle' : state.status, devices: mapDevices() });
    void cmd(() => client.put('/me/player', { device_ids: [device_id], play: false }));
  });
  on('not_ready', () => {
    deviceId = undefined;
    commit({ status: state.track ? state.status : 'loading', devices: mapDevices() });
  });
  on('player_state_changed', (st) => {
    if (st) {
      sdkActive = true;
      remoteActive = false;
      stopPolling();
      commit(fromSdk(st));
    } else {
      sdkActive = false;
      startPolling();
    }
  });
  on('autoplay_failed', () =>
    setError({ kind: 'playback', message: 'Your browser blocked autoplay. Press play to start.' }),
  );
  on('initialization_error', () => setError({ kind: 'unsupported_browser', message: MESSAGES.unsupported_browser }));
  on('account_error', () => setError({ kind: 'premium_required', message: MESSAGES.premium_required }));
  on('authentication_error', () => setError({ kind: 'auth', message: MESSAGES.auth }));
  on('playback_error', ({ message }) => setError({ kind: 'playback', message }));

  sdkPlayer.connect().then(
    (ok) => {
      if (!ok && !state.error) {
        setError({ kind: 'playback', message: 'Could not connect to the Spotify player.' });
      }
    },
    () => setError({ kind: 'playback', message: 'Could not connect to the Spotify player.' }),
  );

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    play(target: PlayTarget, opts) {
      // Browsers only unlock audio from inside a user gesture, so this runs first and synchronously.
      if (!activated) {
        activated = true;
        try {
          sdkPlayer.activateElement().catch(() => {});
        } catch {
          // Older SDK builds throw synchronously; playback can still start.
        }
      }
      return cmd(async () => {
        const device = { device_id: deviceId };
        if (opts?.shuffle !== undefined) {
          await client.put('/me/player/shuffle', undefined, { state: opts.shuffle, ...device });
        }
        const body =
          'contextUri' in target
            ? { context_uri: target.contextUri, ...(target.offsetUri ? { offset: { uri: target.offsetUri } } : {}) }
            : { uris: target.uris, ...(target.index !== undefined ? { offset: { position: target.index } } : {}) };
        await client.put('/me/player/play', body, device);
      });
    },

    toggle: () =>
      cmd(async () => {
        if (sdkActive) return sdkPlayer.togglePlay();
        await client.put(state.status === 'playing' ? '/me/player/pause' : '/me/player/play');
      }),

    next: () => cmd(() => (sdkActive ? sdkPlayer.nextTrack() : client.post('/me/player/next'))),
    previous: () => cmd(() => (sdkActive ? sdkPlayer.previousTrack() : client.post('/me/player/previous'))),
    seek: (ms) =>
      cmd(async () => {
        const position = Math.max(0, Math.round(ms));
        if (sdkActive) return sdkPlayer.seek(position);
        await client.put('/me/player/seek', undefined, { position_ms: position });
      }),

    setVolume: (v) =>
      cmd(async () => {
        const volume = Math.min(Math.max(v, 0), 1);
        commit({ volume });
        if (remoteActive) {
          await client.put('/me/player/volume', undefined, { volume_percent: Math.round(volume * 100) });
        } else {
          await sdkPlayer.setVolume(volume);
        }
      }),

    setShuffle: (on) =>
      cmd(async () => {
        await client.put('/me/player/shuffle', undefined, { state: on });
        commit({ shuffle: on });
      }),
    setRepeat: (mode) =>
      cmd(async () => {
        await client.put('/me/player/repeat', undefined, { state: mode });
        commit({ repeat: mode });
      }),
    enqueue: (uri) => cmd(() => client.post('/me/player/queue', undefined, { uri })),

    refreshDevices: () =>
      cmd(async () => {
        const raw = await client.get<RawDevices>('/me/player/devices');
        rawDevices = raw?.devices ?? [];
        commit({ devices: mapDevices() });
      }),
    transfer: (id) =>
      cmd(async () => {
        await client.put('/me/player', { device_ids: [id], play: true });
        const raw = await client.get<RawDevices>('/me/player/devices');
        rawDevices = raw?.devices ?? [];
        commit({ devices: mapDevices() });
      }),

    dispose() {
      if (disposed) return;
      disposed = true;
      stopPolling();
      offs.forEach((off) => off());
      offs.length = 0;
      try {
        sdkPlayer.disconnect();
      } catch {
        // Already gone.
      }
      listeners.clear();
    },
  };
}
