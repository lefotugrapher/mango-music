import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { DESKTOP_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import { useScrollDirection } from '../lib/useScrollDirection';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import './shell.css';

type Props = {
  children: ReactNode;
  /** Shown above the tab bar on phone widths. */
  miniPlayer: ReactNode;
  /** Shown floating over the content on desktop widths. */
  playerBar: ReactNode;
};

/**
 * The frame every signed-in screen lives in. `<main>` is the only scroll
 * container and runs the full window, so content passes beneath the glass.
 */
export function AppShell({ children, miniPlayer, playerBar }: Props) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [main, setMain] = useState<HTMLElement | null>(null);
  const direction = useScrollDirection(main);
  const { pathname } = useLocation();

  useEffect(() => {
    if (main) main.scrollTop = 0;
  }, [main, pathname]);

  return (
    <div className="shell" data-layout={desktop ? 'desktop' : 'phone'}>
      {desktop && <Sidebar />}
      <main ref={setMain} className="shell__main" tabIndex={-1}>
        {children}
      </main>
      {desktop ? (
        <div className="shell__playerbar">{playerBar}</div>
      ) : (
        <div className="shell__dock" data-compact={direction === 'down' ? 'true' : 'false'}>
          <div className="shell__mini">{miniPlayer}</div>
          <TabBar compact={direction === 'down'} />
        </div>
      )}
    </div>
  );
}
