import type { WebPlaybackState } from './raw';

export const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

export type SdkErrorEvent = { message: string };
export type SdkDeviceEvent = { device_id: string };

export type SdkEventMap = {
  ready: SdkDeviceEvent;
  not_ready: SdkDeviceEvent;
  player_state_changed: WebPlaybackState | null;
  autoplay_failed: undefined;
  initialization_error: SdkErrorEvent;
  authentication_error: SdkErrorEvent;
  account_error: SdkErrorEvent;
  playback_error: SdkErrorEvent;
};

export interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener<E extends keyof SdkEventMap>(event: E, cb: (payload: SdkEventMap[E]) => void): boolean;
  removeListener<E extends keyof SdkEventMap>(event: E, cb?: (payload: SdkEventMap[E]) => void): boolean;
  getCurrentState(): Promise<WebPlaybackState | null>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  activateElement(): Promise<void>;
}

export type SdkPlayerOptions = {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
};

export type SpotifyNamespace = { Player: new (options: SdkPlayerOptions) => SdkPlayer };

type SdkWindow = Window & { Spotify?: SpotifyNamespace; onSpotifyWebPlaybackSDKReady?: () => void };

let cached: Promise<SpotifyNamespace> | undefined;

/** Injects the SDK script once; later calls share the same promise. A failed load can be retried. */
export function loadSdk(doc: Document = document): Promise<SpotifyNamespace> {
  if (cached) return cached;
  const win = doc.defaultView as SdkWindow | null;
  if (!win) return Promise.reject(new Error('The Spotify player needs a browser window.'));
  if (win.Spotify) return (cached = Promise.resolve(win.Spotify));

  const p = new Promise<SpotifyNamespace>((resolve, reject) => {
    win.onSpotifyWebPlaybackSDKReady = () => {
      if (win.Spotify) resolve(win.Spotify);
      else reject(new Error('The Spotify player did not initialise.'));
    };
    const script = doc.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error('Could not load the Spotify player. Check your connection or content blocker.'));
    });
    doc.head.appendChild(script);
  });
  cached = p;
  p.catch(() => {
    if (cached === p) cached = undefined;
  });
  return p;
}

export function _resetSdkForTests(): void {
  cached = undefined;
}
