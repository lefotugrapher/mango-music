import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { NotFoundError } from '../domain/types';
import { createDemoLibrary } from '../demo/library';
import { AlbumPage } from './AlbumPage';
import { ArtistPage } from './ArtistPage';
import { PlaylistPage } from './PlaylistPage';
import { makeDemoSession, renderApp } from '../test/render';
import { makeAlbumRef } from '../test/fixtures';

const lib = createDemoLibrary();
const album = lib.albums[0]!;
const owned = lib.playlists.find((p) => p.owned)!;
const foreign = lib.playlists.find((p) => !p.owned)!;
const artist = lib.artists[0]!;

const routes = (
  <Routes>
    <Route path="/album/:id" element={<AlbumPage />} />
    <Route path="/playlist/:id" element={<PlaylistPage />} />
    <Route path="/artist/:id" element={<ArtistPage />} />
  </Routes>
);

describe('AlbumPage', () => {
  it('plays the album from the top, or shuffled', async () => {
    const session = makeDemoSession();
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(routes, { session, route: `/album/${album.id}` });
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));
    expect(play).toHaveBeenLastCalledWith({ contextUri: album.uri });
    await userEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(play).toHaveBeenLastCalledWith({ contextUri: album.uri }, { shuffle: true });
  });

  it('plays from the track that was clicked', async () => {
    const session = makeDemoSession();
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(routes, { session, route: `/album/${album.id}` });
    const third = album.tracks[2]!;
    const list = within(await screen.findByRole('list', { name: 'Tracks' }));
    await userEvent.click(list.getAllByRole('button')[2]!);
    expect(play).toHaveBeenCalledWith({ contextUri: album.uri, offsetUri: third.uri });
  });

  it('reflects and toggles the saved state', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'isSaved').mockResolvedValue([false]);
    const setSaved = vi.spyOn(session.source, 'setSaved').mockResolvedValue();
    renderApp(routes, { session, route: `/album/${album.id}` });
    const add = await screen.findByRole('button', { name: 'Add to Library' });
    await userEvent.click(add);
    expect(setSaved).toHaveBeenCalledWith([album.uri], true);
    expect(await screen.findByRole('button', { name: 'Remove from Library' })).toBeInTheDocument();
  });

  it('links back to Spotify and keeps the cover square', async () => {
    renderApp(routes, { route: `/album/${album.id}` });
    expect(await screen.findByRole('link', { name: /Open in Spotify/ })).toHaveAttribute('href', album.externalUrl);
    expect(document.querySelector('.detail__art [data-shape]')).toHaveAttribute('data-shape', 'square');
  });

  it('takes a page tint from the artwork colours', async () => {
    renderApp(routes, { route: `/album/${album.id}` });
    await screen.findByRole('button', { name: 'Play' });
    const page = document.querySelector<HTMLElement>('.detail')!;
    expect(page.style.getPropertyValue('--tint')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('says so when the album cannot be found', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'album').mockRejectedValue(new NotFoundError());
    renderApp(routes, { session, route: '/album/missing' });
    expect(await screen.findByRole('heading', { name: "This album isn't available" })).toBeInTheDocument();
  });
});

describe('PlaylistPage', () => {
  it('lists the tracks of a playlist the user owns and plays from a clicked row', async () => {
    const session = makeDemoSession();
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(routes, { session, route: `/playlist/${owned.playlist.id}` });
    const list = within(await screen.findByRole('list', { name: 'Tracks' }));
    expect(list.getAllByRole('button')).toHaveLength(owned.tracks.length);
    await userEvent.click(list.getAllByRole('button')[1]!);
    expect(play).toHaveBeenCalledWith({ contextUri: owned.playlist.uri, offsetUri: owned.tracks[1]!.uri });
  });

  it("explains a withheld track list and still lets the playlist play", async () => {
    const session = makeDemoSession();
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(routes, { session, route: `/playlist/${foreign.playlist.id}` });
    expect(
      await screen.findByText("Spotify doesn't share the track list for playlists you don't own."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Tracks' })).toBeNull();
    const playButton = screen.getByRole('button', { name: 'Play' });
    expect(playButton).toBeEnabled();
    await userEvent.click(playButton);
    expect(play).toHaveBeenCalledWith({ contextUri: foreign.playlist.uri });
  });

  it('shows an empty playlist as empty rather than as withheld', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'playlist').mockResolvedValue({ ...owned.playlist, tracks: [] });
    renderApp(routes, { session, route: `/playlist/${owned.playlist.id}` });
    expect(await screen.findByText('This playlist is empty.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });
});

describe('ArtistPage', () => {
  it('shows albums and singles, and no Top Songs section', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'artist').mockResolvedValue({
      artist,
      albums: [makeAlbumRef({ id: 'a1', name: 'Slow Fires' })],
      singles: [makeAlbumRef({ id: 's1', name: 'Night Bus Home', albumType: 'single' })],
    });
    renderApp(routes, { session, route: `/artist/${artist.id}` });
    expect(await screen.findByRole('heading', { name: artist.name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Albums' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Singles & EPs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Top Songs/ })).toBeNull();
  });

  it('leaves out a group that has nothing in it', async () => {
    const session = makeDemoSession();
    vi.spyOn(session.source, 'artist').mockResolvedValue({
      artist,
      albums: [makeAlbumRef({ id: 'a1', name: 'Slow Fires' })],
      singles: [],
    });
    renderApp(routes, { session, route: `/artist/${artist.id}` });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Albums' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Singles & EPs' })).toBeNull();
  });

  it('plays the artist and opens an album', async () => {
    const session = makeDemoSession();
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    vi.spyOn(session.source, 'artist').mockResolvedValue({
      artist,
      albums: [makeAlbumRef({ id: 'a1', name: 'Slow Fires' })],
      singles: [],
    });
    renderApp(routes, { session, route: `/artist/${artist.id}` });
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));
    expect(play).toHaveBeenCalledWith({ contextUri: artist.uri });
    await userEvent.click(screen.getByRole('button', { name: /^Slow Fires/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/album/a1');
  });
});
