import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetSdkForTests, loadSdk, SDK_URL, type SpotifyNamespace } from './sdk';

type SdkWindow = Window & { Spotify?: SpotifyNamespace; onSpotifyWebPlaybackSDKReady?: () => void };
const win = window as SdkWindow;
const scripts = () => [...document.querySelectorAll<HTMLScriptElement>('script')].filter((s) => s.src === SDK_URL);
const fakeNs = { Player: class {} } as unknown as SpotifyNamespace;

function cleanup() {
  scripts().forEach((s) => s.remove());
  delete win.Spotify;
  delete win.onSpotifyWebPlaybackSDKReady;
  _resetSdkForTests();
}
beforeEach(cleanup);
afterEach(cleanup);

describe('loadSdk', () => {
  it('injects one script and returns the same promise on repeat calls', async () => {
    const a = loadSdk();
    const b = loadSdk();
    expect(a).toBe(b);
    expect(scripts()).toHaveLength(1);
    expect(SDK_URL).toBe('https://sdk.scdn.co/spotify-player.js');

    win.Spotify = fakeNs;
    win.onSpotifyWebPlaybackSDKReady!();
    expect(await a).toBe(fakeNs);
  });

  it('resolves immediately when the SDK is already on the page', async () => {
    win.Spotify = fakeNs;
    expect(await loadSdk()).toBe(fakeNs);
    expect(scripts()).toHaveLength(0);
  });

  it('rejects when the script fails to load, and a later call can retry', async () => {
    const first = loadSdk();
    scripts()[0]!.dispatchEvent(new Event('error'));
    await expect(first).rejects.toThrow(/Spotify player/);

    const second = loadSdk();
    expect(second).not.toBe(first);
    win.Spotify = fakeNs;
    win.onSpotifyWebPlaybackSDKReady!();
    expect(await second).toBe(fakeNs);
  });
});
