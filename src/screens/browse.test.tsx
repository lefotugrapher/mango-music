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

describe('Liked Songs', () => {
  const songs = (n: number, from = 1): Track[] =>
    Array.from({ length: n }, (_, i) => {
      const id = `t${from + i}`;
      return makeTrack({ id, uri: `test:track:${id}`, name: `Song ${from + i}` });
    });
  const uris = (tracks: Track[]) => tracks.map((t) => t.uri);

  it('is one click from Home and shows how many there are', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'librarySongs').mockResolvedValue({ items: songs(2), next: null, total: 312 });
    renderApp(<Home />, { session });
    // The count arrives with the first page of songs, a moment after the link.
    const count = await screen.findByText('312 songs');
    const link = screen.getByRole('link', { name: /Liked Songs/ });
    expect(link).toHaveAttribute('href', '/library/songs');
    expect(link).toContainElement(count);
  });

  it('has its own page, titled Liked Songs, with the full count', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'librarySongs').mockResolvedValue({ items: songs(3), next: 'c1', total: 1240 });
    renderApp(sectionRoutes, { session, route: '/library/songs' });
    expect(await screen.findByRole('heading', { name: 'Liked Songs' })).toBeInTheDocument();
    expect(await screen.findByText('1,240 songs')).toBeInTheDocument();
  });

  it('plays from the top', async () => {
    const session = makeDemoSession();
    const tracks = songs(3);
    vi.spyOn(session.source, 'librarySongs').mockResolvedValue({ items: tracks, next: null, total: 3 });
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(sectionRoutes, { session, route: '/library/songs' });
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));
    expect(play).toHaveBeenCalledWith({ uris: uris(tracks), index: 0 });
  });

  it('shuffles across the whole collection, loading the rest of it first', async () => {
    const session = makeDemoSession();
    const first = songs(2);
    const second = songs(2, 3);
    const librarySongs = vi
      .spyOn(session.source, 'librarySongs')
      .mockImplementation(async (cursor) =>
        cursor === 'c1' ? { items: second, next: null, total: 4 } : { items: first, next: 'c1', total: 4 },
      );
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(sectionRoutes, { session, route: '/library/songs' });
    await userEvent.click(await screen.findByRole('button', { name: 'Shuffle' }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(librarySongs).toHaveBeenCalledWith('c1');
    const [target, options] = play.mock.calls[0]!;
    expect(options).toEqual({ shuffle: true });
    expect(new Set((target as { uris: string[] }).uris)).toEqual(new Set(uris([...first, ...second])));
  });

  it('never asks Spotify to play a song that is unavailable', async () => {
    const session = makeDemoSession();
    const tracks = songs(3);
    tracks[1] = { ...tracks[1]!, playable: false };
    vi.spyOn(session.source, 'librarySongs').mockResolvedValue({ items: tracks, next: null, total: 3 });
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(sectionRoutes, { session, route: '/library/songs' });
    await userEvent.click(await screen.findByRole('button', { name: /Song 3/ }));
    expect(play).toHaveBeenCalledWith({ uris: [tracks[0]!.uri, tracks[2]!.uri], index: 1 });
  });

  it('says so when no songs are liked yet, and offers nothing to play', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'librarySongs').mockResolvedValue({ items: [], next: null, total: 0 });
    renderApp(sectionRoutes, { session, route: '/library/songs' });
    expect(await screen.findByRole('heading', { name: 'No liked songs yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('explains a failure instead of looking empty, and can retry', async () => {
    const session = makeDemoSession();
    const librarySongs = vi
      .spyOn(session.source, 'librarySongs')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: songs(1), next: null, total: 1 });
    renderApp(sectionRoutes, { session, route: '/library/songs' });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /Song 1/ })).toBeInTheDocument();
    expect(librarySongs).toHaveBeenCalledTimes(2);
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
      ['Liked Songs', '/library/songs'],
      ['Playlists', '/library/playlists'],
      ['Artists', '/library/artists'],
      ['Albums', '/library/albums'],
    ] as const) {
      expect(sections.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(sections.getAllByRole('link')[0]).toHaveTextContent('Liked Songs');
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
