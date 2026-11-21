import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import type { Page, ShelfItem, Track } from '../domain/types';
import { Home } from './Home';
import { Library } from './Library';
import { LibrarySection } from './LibrarySection';
import { makeDemoSession, renderApp } from '../test/render';
import { makeItem, makeTrack } from '../test/fixtures';

const sectionRoutes = (
  <Routes>
    <Route path="/library/:group" element={<LibrarySection />} />
    <Route path="/library" element={<p>library root</p>} />
  </Routes>
);

/** Replaces IntersectionObserver so a test can say "the sentinel scrolled into view". */
function captureObservers() {
  const callbacks: IntersectionObserverCallback[] = [];
  class FakeObserver {
    constructor(cb: IntersectionObserverCallback) {
      callbacks.push(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return {
    intersect: () =>
      act(() => {
        for (const cb of callbacks) cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      }),
  };
}

describe('Home', () => {
  it('renders one shelf per shelf returned, in order', async () => {
    const session = makeDemoSession();
    renderApp(<Home />, { session });
    const expected = (await session.source.home()).map((s) => s.title);
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(expected.length));
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(expected);
  });

  it('shows an empty state for an account with no listening history', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'home').mockResolvedValue([]);
    renderApp(<Home />, { session });
    expect(await screen.findByRole('heading', { name: 'Nothing here yet' })).toBeInTheDocument();
  });

  it('offers a retry when Home fails to load, and recovers', async () => {
    const session = makeDemoSession();
    const home = vi
      .spyOn(session.source, 'home')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([{ id: 'recent', title: 'Recently Played', items: [makeItem()] }]);
    renderApp(<Home />, { session });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Recently Played' })).toBeInTheDocument();
    expect(home).toHaveBeenCalledTimes(2);
  });

  it('opens an album from a shelf', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'home').mockResolvedValue([
      { id: 'recent', title: 'Recently Played', items: [makeItem({ kind: 'album', id: 'al9', title: 'Slow Fires' })] },
    ]);
    renderApp(<Home />, { session });
    await userEvent.click(await screen.findByRole('button', { name: /^Slow Fires/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/album/al9');
  });

  it('plays a shelf item from its play button', async () => {
    const session = makeDemoSession();
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    vi.spyOn(session.source, 'home').mockResolvedValue([
      { id: 'recent', title: 'Recently Played', items: [makeItem({ uri: 'test:album:al9', title: 'Slow Fires' })] },
    ]);
    renderApp(<Home />, { session });
    await userEvent.click(await screen.findByRole('button', { name: 'Play Slow Fires' }));
    expect(play).toHaveBeenCalledWith({ contextUri: 'test:album:al9' });
  });
});

describe('Library', () => {
  it('links to its four sections even when nothing has been added yet', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'recentlyAdded').mockResolvedValue([]);
    renderApp(<Library />, { session });
    expect(await screen.findByRole('heading', { name: 'Nothing added yet' })).toBeInTheDocument();
    const sections = within(screen.getByRole('navigation', { name: 'Library sections' }));
    for (const [name, href] of [
      ['Playlists', '/library/playlists'],
      ['Artists', '/library/artists'],
      ['Albums', '/library/albums'],
      ['Songs', '/library/songs'],
    ] as const) {
      expect(sections.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('shows recently added items', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'recentlyAdded').mockResolvedValue([makeItem({ title: 'Harbour Lights' })]);
    renderApp(<Library />, { session });
    expect(await screen.findByRole('button', { name: /^Harbour Lights/ })).toBeInTheDocument();
  });
});

describe('LibrarySection', () => {
  it('shows an empty state when the section has nothing in it', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'library').mockResolvedValue({ items: [], next: null });
    renderApp(sectionRoutes, { session, route: '/library/albums' });
    expect(await screen.findByRole('heading', { name: 'No albums yet' })).toBeInTheDocument();
  });

  it('loads the next page when the end of the list scrolls into view', async () => {
    const observers = captureObservers();
    const session = makeDemoSession();
    const pages: Record<string, Page<ShelfItem>> = {
      first: { items: [makeItem({ id: 'a', title: 'First Album' })], next: 'c1' },
      c1: { items: [makeItem({ id: 'b', title: 'Second Album' })], next: null },
    };
    const library = vi
      .spyOn(session.source, 'library')
      .mockImplementation(async (_group, cursor) => pages[cursor ?? 'first']!);
    renderApp(sectionRoutes, { session, route: '/library/albums' });
    expect(await screen.findByRole('button', { name: /^First Album/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Second Album/ })).toBeNull();

    await observers.intersect();
    expect(await screen.findByRole('button', { name: /^Second Album/ })).toBeInTheDocument();
    expect(library).toHaveBeenLastCalledWith('albums', 'c1');
    expect(screen.getByRole('button', { name: /^First Album/ })).toBeInTheDocument();
  });

  it('lists songs as rows and plays from the one that was clicked', async () => {
    const session = makeDemoSession();
    const tracks: Track[] = [
      makeTrack({ id: 't1', uri: 'test:track:t1', name: 'One' }),
      makeTrack({ id: 't2', uri: 'test:track:t2', name: 'Two' }),
      makeTrack({ id: 't3', uri: 'test:track:t3', name: 'Three' }),
    ];
    vi.spyOn(session.source, 'librarySongs').mockResolvedValue({ items: tracks, next: null });
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(sectionRoutes, { session, route: '/library/songs' });
    await userEvent.click(await screen.findByRole('button', { name: /Two/ }));
    expect(play).toHaveBeenCalledWith({ uris: ['test:track:t1', 'test:track:t2', 'test:track:t3'], index: 1 });
  });

  it('sends an unknown section back to the library', async () => {
    renderApp(sectionRoutes, { route: '/library/podcasts' });
    expect(await screen.findByText('library root')).toBeInTheDocument();
  });
});
