import type { PlayerEngine, PlayerState, PlayTarget, RepeatMode, Track } from '../domain/types';
import { positionNow } from '../lib/position';
import { mulberry32 } from './artwork';
import { resolveTracks, type DemoLibrary } from './library';

const PREVIOUS_RESTART_MS = 3000;

export function createDemoPlayer(lib: DemoLibrary, deps: { now?: () => number } = {}): PlayerEngine {
  const now = deps.now ?? Date.now;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // `context` is the ordered play list (shuffled when shuffle is on), `ctxIdx`
  // the last context track reached. Enqueued tracks jump the line without
  // moving that cursor, so the context resumes where it left off.
  let original: Track[] = [];
  let context: Track[] = [];
  let ctxIdx = 0;
  let userQueue: Track[] = [];
  let fromQueue = false;

  let state: PlayerState = {
    status: 'idle', track: null, positionMs: 0, at: now(), shuffle: false, repeat: 'off',
    volume: 0.8, queue: [], error: null,
    devices: [{ id: 'demo', name: 'This browser', type: 'Computer', active: true, isThisBrowser: true }],
  };

  const upcoming = () => [...userQueue, ...context.slice(ctxIdx + 1)];

  function commit(patch: Partial<PlayerState>) {
    state = { ...state, ...patch, queue: upcoming() };
    schedule();
    listeners.forEach((l) => l());
  }

  function schedule() {
    clearTimeout(timer);
    timer = undefined;
    if (state.status !== 'playing' || !state.track) return;
    const remaining = Math.max(0, state.track.durationMs - positionNow(state, now()));
    timer = setTimeout(onEnded, remaining);
  }

  function shuffleRest(head: Track, rest: Track[]): Track[] {
    // Fixed seed: the same starting point always yields the same order.
    const rnd = mulberry32(0x5eed);
    const out = [...rest];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return [head, ...out];
  }

  function startTrack(track: Track) {
    commit({ status: 'playing', track, positionMs: 0, at: now(), error: null });
  }

  /** manual is a user pressing next; an ended track with repeat 'track' restarts instead. */
  function advance(manual: boolean) {
    const cur = state.track;
    if (!cur) return;
    if (!manual && state.repeat === 'track') return startTrack(cur);
    const queued = userQueue.shift();
    if (queued) {
      fromQueue = true;
      return startTrack(queued);
    }
    fromQueue = false;
    if (ctxIdx + 1 < context.length) {
      ctxIdx += 1;
      return startTrack(context[ctxIdx]!);
    }
    if (state.repeat === 'context' && context.length > 0) {
      ctxIdx = 0;
      return startTrack(context[0]!);
    }
    commit({ status: 'paused', positionMs: 0, at: now() });
  }

  function onEnded() {
    timer = undefined;
    advance(false);
  }

  function fail(message: string) {
    commit({ error: { kind: 'playback', message } });
  }

  async function play(target: PlayTarget, opts?: { shuffle?: boolean }) {
    let tracks: Track[];
    let start = 0;
    if ('contextUri' in target) {
      tracks = resolveTracks(lib, target.contextUri);
      if (target.offsetUri) start = Math.max(0, tracks.findIndex((t) => t.uri === target.offsetUri));
    } else {
      tracks = target.uris.map((u) => resolveTracks(lib, u)[0]).filter((t): t is Track => !!t);
      start = Math.min(Math.max(target.index ?? 0, 0), Math.max(tracks.length - 1, 0));
    }
    if (tracks.length === 0) return fail('Nothing to play for that selection.');

    const shuffle = opts?.shuffle ?? state.shuffle;
    const explicitStart = ('contextUri' in target && target.offsetUri) || ('uris' in target && target.index !== undefined);
    original = tracks;
    userQueue = [];
    fromQueue = false;
    if (shuffle) {
      const head = explicitStart ? tracks[start]! : tracks[Math.floor(mulberry32(tracks.length)() * tracks.length)]!;
      context = shuffleRest(head, tracks.filter((_, i) => tracks[i] !== head));
      ctxIdx = 0;
    } else {
      context = tracks;
      ctxIdx = start;
    }
    commit({ shuffle, status: 'playing', track: context[ctxIdx]!, positionMs: 0, at: now(), error: null });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    play,
    async toggle() {
      if (!state.track) return;
      if (state.status === 'playing') {
        commit({ status: 'paused', positionMs: positionNow(state, now()), at: now() });
      } else {
        commit({ status: 'playing', at: now() });
      }
    },
    async next() {
      advance(true);
    },
    async previous() {
      const cur = state.track;
      if (!cur) return;
      if (positionNow(state, now()) > PREVIOUS_RESTART_MS || (!fromQueue && ctxIdx === 0)) {
        return commit({ positionMs: 0, at: now() });
      }
      if (fromQueue) fromQueue = false;
      else ctxIdx -= 1;
      startTrack(context[ctxIdx]!);
    },
    async seek(ms) {
      if (!state.track) return;
      commit({ positionMs: Math.min(Math.max(ms, 0), state.track.durationMs), at: now() });
    },
    async setVolume(v) {
      const volume = Math.min(Math.max(v, 0), 1);
      if (volume !== state.volume) commit({ volume });
    },
    async setShuffle(on) {
      if (on === state.shuffle) return;
      if (context.length > 0) {
        const head = context[ctxIdx]!;
        if (on) {
          context = shuffleRest(head, context.filter((_, i) => i !== ctxIdx));
          ctxIdx = 0;
        } else {
          context = original;
          ctxIdx = Math.max(0, original.indexOf(head));
        }
      }
      commit({ shuffle: on });
    },
    async setRepeat(mode: RepeatMode) {
      if (mode !== state.repeat) commit({ repeat: mode });
    },
    async enqueue(uri) {
      const track = resolveTracks(lib, uri)[0];
      if (!track) return fail('That item cannot be queued.');
      userQueue.push(track);
      commit({});
    },
    async refreshDevices() {},
    async transfer() {},
    dispose() {
      clearTimeout(timer);
      timer = undefined;
      listeners.clear();
    },
  };
}
