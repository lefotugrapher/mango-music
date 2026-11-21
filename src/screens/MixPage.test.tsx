import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { NotFoundError, type Mix, type Session } from '../domain/types';
import { Home } from './Home';
import { MixPage } from './MixPage';
import { makeDemoSession, renderApp } from '../test/render';
import { makeItem, makeTrack } from '../test/fixtures';

const tracks = [1, 2, 3].map((n) => makeTrack({ id: `t${n}`, uri: `test:track:t${n}`, name: `Song ${n}` }));
const mix: Mix = {
  id: 'on-repeat',
  title: 'On Repeat',
  description: 'What you play most right now',
  image: { url: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E' },
  tracks,
};

/** A demo session whose source answers mix() with whatever the test supplies. */
function sessionWithMix(answer: (id: string) => Promise<Mix>): Session & { mixCalls: string[] } {
  const session = makeDemoSession();
  const mixCalls: string[] = [];
  session.source.mix = (id: string) => {
    mixCalls.push(id);
    return answer(id);
  };
  return Object.assign(session, { mixCalls });
}

const routes = (
  <Routes>
    <Route path="/mix/:id" element={<MixPage />} />
  </Routes>
);

describe('MixPage', () => {
  it('shows the mix with its description and size', async () => {
    const session = sessionWithMix(async () => mix);
    renderApp(routes, { session, route: '/mix/on-repeat' });
    expect(await screen.findByRole('heading', { name: 'On Repeat' })).toBeInTheDocument();
    expect(screen.getByText('What you play most right now')).toBeInTheDocument();
    expect(screen.getByText(/3 songs/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Tracks' })).getAllByRole('button')).toHaveLength(3);
    expect(session.mixCalls).toEqual(['on-repeat']);
  });

  it('asks for the mix named in the address, including artist mixes', async () => {
    const session = sessionWithMix(async (id) => ({ ...mix, id, title: 'Juno Mix' }));
    renderApp(routes, { session, route: `/mix/${encodeURIComponent('artist:abc123')}` });
    expect(await screen.findByRole('heading', { name: 'Juno Mix' })).toBeInTheDocument();
    expect(session.mixCalls).toEqual(['artist:abc123']);
  });

  it('plays from the top, shuffled, or from the song that was clicked', async () => {
    const session = sessionWithMix(async () => mix);
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(routes, { session, route: '/mix/on-repeat' });
    const all = tracks.map((t) => t.uri);

    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));
    expect(play).toHaveBeenLastCalledWith({ uris: all, index: 0 });

    await userEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(play).toHaveBeenLastCalledWith({ uris: all, index: 0 }, { shuffle: true });

    await userEvent.click(within(screen.getByRole('list', { name: 'Tracks' })).getAllByRole('button')[2]!);
    expect(play).toHaveBeenLastCalledWith({ uris: all, index: 2 });
  });

  it('never asks Spotify to play a song that is unavailable', async () => {
    const mixed = { ...mix, tracks: [tracks[0]!, { ...tracks[1]!, playable: false }, tracks[2]!] };
    const session = sessionWithMix(async () => mixed);
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(routes, { session, route: '/mix/on-repeat' });
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));
    expect(play).toHaveBeenCalledWith({ uris: [tracks[0]!.uri, tracks[2]!.uri], index: 0 });
  });

  it('says so when the mix does not exist', async () => {
    const session = sessionWithMix(async () => {
      throw new NotFoundError();
    });
    renderApp(routes, { session, route: '/mix/nope' });
    expect(await screen.findByRole('heading', { name: "This mix isn't available" })).toBeInTheDocument();
  });

  it('offers a retry when the mix could not be loaded', async () => {
    let attempts = 0;
    const session = sessionWithMix(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return mix;
    });
    renderApp(routes, { session, route: '/mix/on-repeat' });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'On Repeat' })).toBeInTheDocument();
  });
});

describe('mixes on Home', () => {
  const shelf = [
    {
      id: 'top-mixes',
      title: 'Your Top Mixes',
      items: [makeItem({ kind: 'mix', id: 'artist:abc123', uri: 'mango:mix:artist:abc123', title: 'Juno Mix' })],
    },
  ];

  it('opens a mix from its card', async () => {
    const session = sessionWithMix(async () => mix);
    vi.spyOn(session.source, 'home').mockResolvedValue(shelf);
    renderApp(<Home />, { session });
    await userEvent.click(await screen.findByRole('button', { name: /^Juno Mix/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/mix/${encodeURIComponent('artist:abc123')}`);
  });

  it('plays a mix straight from its card', async () => {
    const session = sessionWithMix(async () => mix);
    vi.spyOn(session.source, 'home').mockResolvedValue(shelf);
    const play = vi.spyOn(session.player, 'play').mockResolvedValue();
    renderApp(<Home />, { session });
    await userEvent.click(await screen.findByRole('button', { name: 'Play Juno Mix' }));
    await waitFor(() => expect(play).toHaveBeenCalledWith({ uris: tracks.map((t) => t.uri), index: 0 }));
    expect(session.mixCalls).toEqual(['artist:abc123']);
  });
});
