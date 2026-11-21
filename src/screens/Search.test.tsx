import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchResults } from '../domain/types';
import { Search } from './Search';
import { makeDemoSession, renderApp } from '../test/render';
import { makeItem, makeTrack } from '../test/fixtures';

const empty = (): SearchResults => ({
  tracks: { items: [], next: null },
  artists: { items: [], next: null },
  albums: { items: [], next: null },
  playlists: { items: [], next: null },
});

const type = (value: string) =>
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value } });

describe('Search', () => {
  it('prompts before anything is typed and searches nothing', () => {
    const session = makeDemoSession();
    const search = vi.spyOn(session.source, 'search');
    renderApp(<Search />, { session });
    expect(screen.getByRole('heading', { name: 'Search Spotify' })).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it('waits for a pause in typing, then searches once for the final text', async () => {
    const session = makeDemoSession();
    const search = vi.spyOn(session.source, 'search').mockResolvedValue(empty());
    renderApp(<Search />, { session });
    type('s');
    type('sl');
    type('slow');
    expect(search).not.toHaveBeenCalled();
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search).toHaveBeenCalledWith('slow');
  });

  it('groups results and plays a song from them', async () => {
    const session = makeDemoSession();
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    vi.spyOn(session.source, 'search').mockResolvedValue({
      ...empty(),
      tracks: { items: [makeTrack({ uri: 'test:track:t7', name: 'Slow Fires' })], next: null },
      albums: { items: [makeItem({ title: 'Slow Fires Deluxe' })], next: null },
    });
    renderApp(<Search />, { session });
    type('slow');
    expect(await screen.findByRole('heading', { name: 'Songs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Albums' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Artists' })).toBeNull();
    await userEvent.click(within(screen.getByRole('list', { name: 'Songs' })).getByRole('button'));
    expect(play).toHaveBeenCalledWith({ uris: ['test:track:t7'] });
  });

  it('never lets a slow answer to an old query replace a newer one', async () => {
    const session = makeDemoSession();
    let resolveOld!: (r: SearchResults) => void;
    vi.spyOn(session.source, 'search').mockImplementation((query) =>
      query === 'old'
        ? new Promise<SearchResults>((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve({ ...empty(), albums: { items: [makeItem({ title: 'New Result' })], next: null } }),
    );
    renderApp(<Search />, { session });
    type('old');
    await waitFor(() => expect(resolveOld).toBeDefined());
    type('new');
    expect(await screen.findByRole('button', { name: /^New Result/ })).toBeInTheDocument();
    resolveOld({ ...empty(), albums: { items: [makeItem({ title: 'Old Result' })], next: null } });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: /^Old Result/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^New Result/ })).toBeInTheDocument();
  });

  it('loads more of one group and appends it', async () => {
    const session = makeDemoSession();
    const search = vi.spyOn(session.source, 'search').mockImplementation(async (_q, kind, cursor) =>
      kind === 'album' && cursor === 'c1'
        ? { ...empty(), albums: { items: [makeItem({ id: 'b', title: 'Second Album' })], next: null } }
        : { ...empty(), albums: { items: [makeItem({ id: 'a', title: 'First Album' })], next: 'c1' } },
    );
    renderApp(<Search />, { session });
    type('album');
    await userEvent.click(await screen.findByRole('button', { name: 'Show more albums' }));
    expect(search).toHaveBeenLastCalledWith('album', 'album', 'c1');
    expect(await screen.findByRole('button', { name: /^Second Album/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^First Album/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more albums' })).toBeNull();
  });

  it('names the query when nothing matches', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'search').mockResolvedValue(empty());
    renderApp(<Search />, { session });
    type('zzzz');
    expect(await screen.findByRole('heading', { name: 'No results for “zzzz”' })).toBeInTheDocument();
  });

  it('tells the reader when a search fails', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'search').mockRejectedValue(new Error('offline'));
    renderApp(<Search />, { session });
    type('slow');
    expect(await screen.findByRole('heading', { name: "Search didn't work" })).toBeInTheDocument();
  });
});
