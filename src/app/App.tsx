import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';
import { redirectUriFor } from '../auth/redirect';
import { beginLogin, completeLogin, type LoginResult } from '../auth/spotifyAuth';
import { createDemoPlayer } from '../demo/DemoPlayer';
import { createDemoSource } from '../demo/DemoSource';
import { createDemoLibrary } from '../demo/library';
import type { Session } from '../domain/types';
import { GlassFilterHost } from '../glass/GlassFilterHost';
import { detectGlassTier, readGlassEnv } from '../glass/tier';
import { readJSON, removeKey, writeJSON } from '../lib/storage';
import { MiniPlayer } from '../nowplaying/MiniPlayer';
import { NowPlayingSheet } from '../nowplaying/NowPlayingSheet';
import { PlayerBar } from '../nowplaying/PlayerBar';
import { Settings } from '../screens/Settings';
import { Setup } from '../screens/Setup';
import { Loading } from '../screens/shared';
import { SessionProvider } from '../session/SessionProvider';
import { createSpotifySession, type SpotifySession } from '../session/spotifySession';
import { applySettings, useSettings } from '../settings/store';
import { AppShell } from '../shell/AppShell';
import { PlayerNotice } from '../shell/PlayerNotice';
import { SpotifyError } from '../spotify/contract';
import { decideBoot, noticeFor, withoutAuthParams, type NoticeReason } from './boot';
import { AppRoutes } from './routes';

const CLIENT_ID_KEY = 'pane.clientId';
const TOKENS_KEY = 'pane.tokens';

/** Everything the app reaches outside itself, so tests can stand in for it. */
export type AppDeps = {
  location: Pick<Location, 'href' | 'protocol' | 'hostname' | 'port' | 'pathname'>;
  completeLogin: (url: URL) => Promise<LoginResult>;
  beginLogin: (clientId: string, redirectUri: string) => Promise<void>;
  createSpotifySession: (clientId: string) => Promise<SpotifySession>;
  replaceUrl: (url: string) => void;
};

const defaultDeps = (): AppDeps => ({
  location: window.location,
  completeLogin: (url) => completeLogin(url),
  beginLogin: (clientId, redirectUri) => beginLogin(clientId, redirectUri),
  createSpotifySession,
  replaceUrl: (url) => window.history.replaceState(null, '', url),
});

function createDemoSession(): Session {
  const lib = createDemoLibrary();
  return { mode: 'demo', source: createDemoSource(lib), player: createDemoPlayer(lib) };
}

const storedClientId = () => {
  const value = readJSON<unknown>(CLIENT_ID_KEY, null);
  return typeof value === 'string' && value ? value : null;
};

type Phase = { name: 'booting' } | { name: 'setup'; notice?: string } | { name: 'ready'; session: Session };

export function App({ deps: injected }: { deps?: AppDeps }) {
  const deps = useMemo(() => injected ?? defaultDeps(), [injected]);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  const [phase, setPhase] = useState<Phase>({ name: 'booting' });
  const [clientId, setClientId] = useState(storedClientId);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  /** Detaches the signed-out listener of the live Spotify session, if any. */
  const stopListening = useRef<(() => void) | null>(null);

  const glass = useSettings((s) => s.glass);
  const tier = useMemo(() => detectGlassTier(readGlassEnv(glass)), [glass]);

  useEffect(() => {
    const { appearance, glass: g, reduceMotion } = useSettings.getState();
    applySettings({ appearance, glass: g, reduceMotion });
  }, []);

  /** Ends the current session, whatever kind it is, and returns to Setup. */
  const leave = useCallback(
    (session: Session | null, reason?: NoticeReason) => {
      stopListening.current?.();
      stopListening.current = null;
      session?.player.dispose();
      queryClient.clear();
      setNowPlayingOpen(false);
      // Start the next session at Home rather than wherever this one ended.
      if (window.location.hash && window.location.hash !== '#/') window.location.hash = '#/';
      setPhase({ name: 'setup', notice: reason ? noticeFor(reason) : undefined });
    },
    [queryClient],
  );

  const startSpotify = useCallback(
    async (id: string) => {
      setPhase({ name: 'booting' });
      let session: SpotifySession;
      try {
        session = await deps.createSpotifySession(id);
      } catch {
        setPhase({ name: 'setup', notice: noticeFor('start_failed') });
        return;
      }
      // Any sign-out from here on (a revoked refresh token) ends the session.
      let ended = false;
      stopListening.current = session.tokens.onSignedOut(() => {
        ended = true;
        leave(session, 'signed_out');
      });
      try {
        // One cheap request up front: an account that is not on the developer
        // app's user list is refused here, with a 403, before any screen loads.
        await session.source.me();
      } catch (error) {
        if (error instanceof SpotifyError && error.reason === 'forbidden') {
          leave(session, 'forbidden');
          return;
        }
        // Offline or a transient failure: open the app and let screens retry.
      }
      // The session may have been signed out while the profile check ran.
      if (!ended) setPhase({ name: 'ready', session });
    },
    [deps, leave],
  );

  // Boot exactly once per page load. An authorization code is single-use, so
  // React's development double-run of effects must not exchange it twice.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const url = new URL(deps.location.href);
    const id = storedClientId();
    const action = decideBoot({ url, clientId: id, hasTokens: readJSON<unknown>(TOKENS_KEY, null) !== null });

    void (async () => {
      if (action === 'setup') {
        setPhase({ name: 'setup' });
        return;
      }
      if (action === 'restore') {
        await startSpotify(id!);
        return;
      }
      const result = await deps.completeLogin(url);
      deps.replaceUrl(withoutAuthParams(url));
      if (result.ok && id) await startSpotify(id);
      else if (!result.ok && result.reason !== 'none') setPhase({ name: 'setup', notice: noticeFor(result.reason) });
      else setPhase({ name: 'setup' });
    })();
  }, [deps, startSpotify]);

  const connect = useCallback(
    (id: string) => {
      writeJSON(CLIENT_ID_KEY, id);
      setClientId(id);
      void deps.beginLogin(id, redirectUriFor(deps.location).uri);
    },
    [deps],
  );

  const session = phase.name === 'ready' ? phase.session : null;

  const disconnect = useCallback(() => {
    if (!session) return;
    // Detach first: clearing tokens notifies listeners, and a deliberate
    // disconnect should not be reported as "Spotify signed you out".
    stopListening.current?.();
    stopListening.current = null;
    if (session.mode === 'spotify') (session as SpotifySession).tokens.clear();
    leave(session);
  }, [leave, session]);

  const changeClientId = useCallback(() => {
    removeKey(CLIENT_ID_KEY);
    setClientId(null);
    disconnect();
  }, [disconnect]);

  const openNowPlaying = useCallback(() => setNowPlayingOpen(true), []);
  const closeNowPlaying = useCallback(() => setNowPlayingOpen(false), []);

  return (
    <QueryClientProvider client={queryClient}>
      <GlassFilterHost tier={tier}>
        {phase.name === 'booting' && (
          <div className="app-boot">
            <Loading label="Starting Pane" />
          </div>
        )}
        {phase.name === 'setup' && (
          <Setup
            notice={phase.notice}
            defaultClientId={clientId ?? ''}
            location={deps.location}
            onConnect={connect}
            onDemo={() => setPhase({ name: 'ready', session: createDemoSession() })}
          />
        )}
        {session && (
          <HashRouter>
            <SessionProvider session={session}>
              <AppShell
                miniPlayer={<MiniPlayer onExpand={openNowPlaying} />}
                playerBar={<PlayerBar onExpand={openNowPlaying} />}
              >
                <AppRoutes
                  settings={
                    <Settings mode={session.mode} onDisconnect={disconnect} onChangeClientId={changeClientId} />
                  }
                />
              </AppShell>
              <PlayerNotice />
              <NowPlayingSheet open={nowPlayingOpen} onClose={closeNowPlaying} />
            </SessionProvider>
          </HashRouter>
        )}
      </GlassFilterHost>
    </QueryClientProvider>
  );
}
