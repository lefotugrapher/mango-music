import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoLibrary } from './library';
import { createDemoPlayer } from './DemoPlayer';
import { positionNow } from '../lib/position';
import type { PlayerEngine } from '../domain/types';

const lib = createDemoLibrary();
const [a, b, c, d] = lib.tracks;
const dur = (t: typeof a) => t!.durationMs;
let p: PlayerEngine;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  p = createDemoPlayer(lib);
});
afterEach(() => {
  p.dispose();
  vi.useRealTimers();
});

describe('DemoPlayer', () => {
  it('starts idle with one device and volume 0.8', () => {
    const s = p.getState();
    expect(s.status).toBe('idle');
    expect(s.track).toBeNull();
    expect(s.volume).toBe(0.8);
    expect(s.devices).toEqual([
      { id: 'demo', name: 'This browser', type: 'Computer', active: true, isThisBrowser: true },
    ]);
  });

  it('plays uris from an index and queues the rest', async () => {
    await p.play({ uris: [a!.uri, b!.uri, c!.uri], index: 1 });
    const s = p.getState();
    expect(s.status).toBe('playing');
    expect(s.track?.uri).toBe(b!.uri);
    expect(s.queue.map((t) => t.uri)).toEqual([c!.uri]);
  });

  it('auto-advances at the end of a track', async () => {
    await p.play({ uris: [a!.uri, b!.uri, c!.uri] });
    vi.advanceTimersByTime(dur(a));
    expect(p.getState().track?.uri).toBe(b!.uri);
    vi.advanceTimersByTime(dur(b));
    expect(p.getState().track?.uri).toBe(c!.uri);
  });

  it('end of list: off pauses at 0, context wraps, track restarts', async () => {
    await p.play({ uris: [a!.uri, b!.uri] });
    vi.advanceTimersByTime(dur(a) + dur(b));
    expect(p.getState()).toMatchObject({ status: 'paused', positionMs: 0 });
    expect(p.getState().track?.uri).toBe(b!.uri);

    await p.play({ uris: [a!.uri, b!.uri] });
    await p.setRepeat('context');
    vi.advanceTimersByTime(dur(a) + dur(b));
    expect(p.getState().track?.uri).toBe(a!.uri);
    expect(p.getState().status).toBe('playing');

    await p.setRepeat('track');
    vi.advanceTimersByTime(dur(a));
    expect(p.getState().track?.uri).toBe(a!.uri);
    expect(p.getState().status).toBe('playing');
  });

  it('toggle pauses and holds the position', async () => {
    await p.play({ uris: [a!.uri, b!.uri] });
    vi.advanceTimersByTime(5000);
    await p.toggle();
    expect(p.getState().status).toBe('paused');
    const held = positionNow(p.getState(), Date.now());
    expect(held).toBe(5000);
    vi.advanceTimersByTime(20_000);
    expect(positionNow(p.getState(), Date.now())).toBe(held);
    await p.toggle();
    expect(p.getState().status).toBe('playing');
  });

  it('paused tracks do not auto-advance', async () => {
    await p.play({ uris: [a!.uri, b!.uri] });
    await p.toggle();
    vi.advanceTimersByTime(dur(a) * 2);
    expect(p.getState().track?.uri).toBe(a!.uri);
  });

  it('clamps seek and volume', async () => {
    await p.play({ uris: [a!.uri] });
    await p.seek(-5);
    expect(p.getState().positionMs).toBe(0);
    await p.seek(dur(a) * 10);
    expect(p.getState().positionMs).toBe(dur(a));
    await p.setVolume(3);
    expect(p.getState().volume).toBe(1);
    await p.setVolume(-1);
    expect(p.getState().volume).toBe(0);
  });

  it('previous restarts after 3s, otherwise goes back', async () => {
    await p.play({ uris: [a!.uri, b!.uri], index: 1 });
    vi.advanceTimersByTime(4000);
    await p.previous();
    expect(p.getState().track?.uri).toBe(b!.uri);
    expect(positionNow(p.getState(), Date.now())).toBe(0);
    vi.advanceTimersByTime(1000);
    await p.previous();
    expect(p.getState().track?.uri).toBe(a!.uri);
  });

  it('shuffle keeps the current track and is deterministic', async () => {
    const uris = lib.tracks.slice(0, 8).map((t) => t.uri);
    await p.play({ uris, index: 2 });
    await p.setShuffle(true);
    const s = p.getState();
    expect(s.track?.uri).toBe(uris[2]);
    expect(s.shuffle).toBe(true);
    const q1 = s.queue.map((t) => t.uri);
    expect(new Set(q1.concat(uris[2]!))).toEqual(new Set(uris));

    const p2 = createDemoPlayer(lib);
    await p2.play({ uris, index: 2 });
    await p2.setShuffle(true);
    expect(p2.getState().queue.map((t) => t.uri)).toEqual(q1);
    p2.dispose();

    await p.setShuffle(false);
    expect(p.getState().queue.map((t) => t.uri)).toEqual(uris.slice(3));
  });

  it('enqueue places a track next', async () => {
    await p.play({ uris: [a!.uri, b!.uri] });
    await p.enqueue(d!.uri);
    expect(p.getState().queue[0]?.uri).toBe(d!.uri);
    vi.advanceTimersByTime(dur(a));
    expect(p.getState().track?.uri).toBe(d!.uri);
    vi.advanceTimersByTime(dur(d));
    expect(p.getState().track?.uri).toBe(b!.uri);
  });

  it('plays an album context from an offset', async () => {
    const album = lib.albums[1]!;
    const offset = album.tracks[3]!;
    await p.play({ contextUri: album.uri, offsetUri: offset.uri });
    expect(p.getState().track?.uri).toBe(offset.uri);
    expect(p.getState().queue.length).toBe(album.tracks.length - 4);
  });

  it('reports a playback error for unknown uris without changing status', async () => {
    await p.play({ uris: ['nope'] });
    expect(p.getState().error?.kind).toBe('playback');
    expect(p.getState().status).toBe('idle');
  });

  it('notifies once per change and keeps the state reference otherwise', async () => {
    const s0 = p.getState();
    expect(p.getState()).toBe(s0);
    const fn = vi.fn();
    const off = p.subscribe(fn);
    await p.play({ uris: [a!.uri] });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(p.getState()).not.toBe(s0);
    await p.refreshDevices();
    await p.transfer('demo');
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    await p.toggle();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
