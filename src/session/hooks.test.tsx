import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createDemoLibrary } from '../demo/library';
import { createDemoSource } from '../demo/DemoSource';
import { createDemoPlayer } from '../demo/DemoPlayer';
import type { Session } from '../domain/types';
import { SessionProvider } from './SessionProvider';
import { usePlayer, usePlayerState, useSession, useSource } from './hooks';

const lib = createDemoLibrary();
const makeSession = (): Session => ({ mode: 'demo', source: createDemoSource(lib), player: createDemoPlayer(lib) });

describe('session hooks', () => {
  it('throws a clear error without a session', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
    expect(() =>
      render(
        <SessionProvider session={null}>
          <Probe />
        </SessionProvider>,
      ),
    ).toThrow(/session/i);
  });

  it('exposes session parts and re-renders on player changes', async () => {
    const session = makeSession();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SessionProvider session={session}>{children}</SessionProvider>
    );
    const { result } = renderHook(
      () => ({ s: useSession(), src: useSource(), pl: usePlayer(), st: usePlayerState() }),
      { wrapper },
    );
    expect(result.current.s).toBe(session);
    expect(result.current.src).toBe(session.source);
    expect(result.current.pl).toBe(session.player);
    expect(result.current.st.status).toBe('idle');
    await act(() => session.player.play({ uris: [lib.tracks[0]!.uri] }));
    expect(result.current.st.status).toBe('playing');
    session.player.dispose();
  });
});

function Probe() {
  useSession();
  return <p>ok</p>;
}
