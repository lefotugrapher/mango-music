import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { AppShell } from './AppShell';
import { renderApp, setDesktop } from '../test/render';

const shell = (
  <AppShell miniPlayer={<div>mini player</div>} playerBar={<div>player bar</div>}>
    <p>page content</p>
  </AppShell>
);

describe('AppShell on a desktop-width window', () => {
  it('shows the sidebar and the player bar, not the tab bar', () => {
    setDesktop(true);
    renderApp(shell);
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Tab bar' })).toBeNull();
    expect(screen.getByText('player bar')).toBeInTheDocument();
    expect(screen.queryByText('mini player')).toBeNull();
    expect(screen.getByRole('main')).toHaveTextContent('page content');
  });

  it('links to every section', async () => {
    setDesktop(true);
    renderApp(shell);
    const nav = within(screen.getByRole('navigation', { name: 'Sidebar' }));
    const hrefs: Record<string, string> = {
      Search: '/search',
      Home: '/',
      'Recently Added': '/library',
      Playlists: '/library/playlists',
      Artists: '/library/artists',
      Albums: '/library/albums',
      'Liked Songs': '/library/songs',
      Settings: '/settings',
    };
    for (const [name, href] of Object.entries(hrefs)) {
      expect(nav.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    // Spotify's liked songs go by the name people know, not a generic "Songs".
    expect(nav.queryByRole('link', { name: 'Songs' })).toBeNull();
  });

  it('keeps Liked Songs near the top, right under Home', () => {
    setDesktop(true);
    renderApp(shell);
    const names = within(screen.getByRole('navigation', { name: 'Sidebar' }))
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(names.slice(0, 3)).toEqual(['Search', 'Home', 'Liked Songs']);
  });

  it("lists the user's playlists in the sidebar", async () => {
    setDesktop(true);
    const { session } = renderApp(shell);
    const first = (await session!.source.library('playlists')).items[0]!;
    const nav = within(screen.getByRole('navigation', { name: 'Sidebar' }));
    expect(await nav.findByRole('link', { name: first.title })).toHaveAttribute('href', `/playlist/${first.id}`);
  });

  it('marks the current section', () => {
    setDesktop(true);
    renderApp(shell, { route: '/library/albums' });
    const nav = within(screen.getByRole('navigation', { name: 'Sidebar' }));
    expect(nav.getByRole('link', { name: 'Albums' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(nav.getByRole('link', { name: 'Recently Added' })).not.toHaveAttribute('aria-current');
  });
});

describe('AppShell on a phone-width window', () => {
  it('shows the tab bar and the mini player, not the sidebar', () => {
    setDesktop(false);
    renderApp(shell);
    const tabs = within(screen.getByRole('navigation', { name: 'Tab bar' }));
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).toBeNull();
    expect(screen.getByText('mini player')).toBeInTheDocument();
    expect(screen.queryByText('player bar')).toBeNull();
    expect(tabs.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(tabs.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library');
    expect(tabs.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search');
  });

  it('shrinks the tab bar while reading down and restores it on the way up', () => {
    setDesktop(false);
    renderApp(shell);
    const main = screen.getByRole('main');
    const tabs = screen.getByRole('navigation', { name: 'Tab bar' });
    expect(tabs).toHaveAttribute('data-compact', 'false');

    main.scrollTop = 300;
    fireEvent.scroll(main);
    expect(tabs).toHaveAttribute('data-compact', 'true');

    main.scrollTop = 200;
    fireEvent.scroll(main);
    expect(tabs).toHaveAttribute('data-compact', 'false');
  });

  it('keeps Library selected on its sub-pages', () => {
    setDesktop(false);
    renderApp(shell, { route: '/library/songs' });
    const tabs = within(screen.getByRole('navigation', { name: 'Tab bar' }));
    expect(tabs.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
  });
});
