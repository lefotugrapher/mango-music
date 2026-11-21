import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { Session } from '../domain/types';
import { createDemoLibrary } from '../demo/library';
import { createDemoSource } from '../demo/DemoSource';
import { createDemoPlayer } from '../demo/DemoPlayer';
import { SessionProvider } from '../session/SessionProvider';

export function makeDemoSession(): Session {
  const lib = createDemoLibrary();
  return { mode: 'demo', source: createDemoSource(lib), player: createDemoPlayer(lib) };
}

/** Makes matchMedia answer from a predicate until the test ends (setup.ts restores it). */
export function mockMatchMedia(matches: (query: string) => boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

export const setDesktop = (desktop: boolean) => mockMatchMedia((q) => (q.includes('min-width: 1024px') ? desktop : false));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

type Options = { route?: string; session?: Session | null };

/** Renders with the router, query cache and session the app's screens expect. */
export function renderApp(ui: ReactElement, { route = '/', session = makeDemoSession() }: Options = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <SessionProvider session={session}>
          {ui}
          <LocationProbe />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, session, queryClient };
}
