import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';
import { createDemoPlayer } from '../demo/DemoPlayer';
import { createDemoSource } from '../demo/DemoSource';
import { createDemoLibrary } from '../demo/library';
import type { Session } from '../domain/types';
import { GlassFilterHost } from '../glass/GlassFilterHost';
import { detectGlassTier, readGlassEnv } from '../glass/tier';
import { SessionProvider } from '../session/SessionProvider';
import { AppShell } from '../shell/AppShell';
import { AppRoutes } from './routes';

function createDemoSession(): Session {
  const lib = createDemoLibrary();
  return { mode: 'demo', source: createDemoSource(lib), player: createDemoPlayer(lib) };
}

export function App() {
  const tier = useMemo(() => detectGlassTier(readGlassEnv('auto')), []);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  const [session] = useState<Session>(createDemoSession);

  return (
    <QueryClientProvider client={queryClient}>
      <GlassFilterHost tier={tier}>
        <HashRouter>
          <SessionProvider session={session}>
            <AppShell miniPlayer={null} playerBar={null}>
              <AppRoutes />
            </AppShell>
          </SessionProvider>
        </HashRouter>
      </GlassFilterHost>
    </QueryClientProvider>
  );
}
