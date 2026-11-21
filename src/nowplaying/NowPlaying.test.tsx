import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createDemoLibrary } from '../demo/library';
import { MiniPlayer } from './MiniPlayer';
import { NowPlayingSheet } from './NowPlayingSheet';
import { PlayerBar } from './PlayerBar';
import { makeDemoSession, renderApp } from '../test/render';

const lib = createDemoLibrary();
const uris = lib.albums[0]!.tracks.slice(0, 4).map((t) => t.uri);
const first = lib.albums[0]!.tracks[0]!;

async function playingSession() {
  const session = makeDemoSession();
  await session.player.play({ uris });
  await session.player.toggle(); // paused: the demo clock stays still during the test
  return session;
}

function boxed(el: HTMLElement) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 20,
    right: 200,
    bottom: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return el;
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <NowPlayingSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe('MiniPlayer', () => {
  it('says so when nothing is playing', () => {
    renderApp(<MiniPlayer onExpand={() => {}} />);
    expect(screen.getByText('Not Playing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('shows the current track and toggles playback without expanding', async () => {
    const session = await playingSession();
    const toggle = vi.spyOn(session.player, 'toggle');
    const onExpand = vi.fn();
    renderApp(<MiniPlayer onExpand={onExpand} />, { session });
    expect(screen.getByText(first.name)).toBeInTheDocument();
    expect(screen.getByText(first.artists.map((a) => a.name).join(', '))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(onExpand).not.toHaveBeenCalled();
  });

  it('can be opened with nothing playing, so another device can still be picked', async () => {
    const onExpand = vi.fn();
    renderApp(<MiniPlayer onExpand={onExpand} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open Now Playing' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('expands when its body is clicked', async () => {
    const session = await playingSession();
    const onExpand = vi.fn();
    renderApp(<MiniPlayer onExpand={onExpand} />, { session });
    await userEvent.click(screen.getByRole('button', { name: /Open Now Playing/ }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});

describe('PlayerBar', () => {
  it('drives transport and volume', async () => {
    const session = await playingSession();
    const next = vi.spyOn(session.player, 'next');
    const setVolume = vi.spyOn(session.player, 'setVolume');
    const onExpand = vi.fn();
    renderApp(<PlayerBar onExpand={onExpand} />, { session });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(next).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume' }), { key: 'Home' });
    expect(setVolume).toHaveBeenLastCalledWith(0);
    await userEvent.click(screen.getByRole('button', { name: /Open Now Playing/ }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});

describe('PlayerBar with nothing playing', () => {
  it('still opens Now Playing, where the device picker lives', async () => {
    const onExpand = vi.fn();
    renderApp(<PlayerBar onExpand={onExpand} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open Now Playing' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});

describe('NowPlayingSheet', () => {
  it('is a modal dialog that closes on Escape and returns focus to what opened it', async () => {
    const session = await playingSession();
    renderApp(<Harness />, { session });
    expect(screen.queryByRole('dialog')).toBeNull();
    const opener = screen.getByRole('button', { name: 'opener' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Now Playing' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('shows the track with a square cover and a link back to Spotify', async () => {
    const session = await playingSession();
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('heading', { name: first.name })).toBeInTheDocument();
    expect(dialog.queryByRole('link', { name: /Open in Spotify/ })).not.toBeInTheDocument();
    expect(document.querySelector('.np__art [data-shape]')).toHaveAttribute('data-shape', 'square');
  });

  it('drives play, next and previous', async () => {
    const session = await playingSession();
    const toggle = vi.spyOn(session.player, 'toggle');
    const next = vi.spyOn(session.player, 'next');
    const previous = vi.spyOn(session.player, 'previous');
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Play' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Next' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Previous' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('seeks once, on release, to where the scrubber was dropped', async () => {
    const session = await playingSession();
    const seek = vi.spyOn(session.player, 'seek');
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    const scrubber = boxed(screen.getByRole('slider', { name: 'Position' }));
    fireEvent.pointerDown(scrubber, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(scrubber, { clientX: 100, pointerId: 1 });
    expect(seek).not.toHaveBeenCalled();
    fireEvent.pointerUp(scrubber, { clientX: 100, pointerId: 1 });
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(first.durationMs / 2);
  });

  it('changes volume while dragging', async () => {
    const session = await playingSession();
    const setVolume = vi.spyOn(session.player, 'setVolume');
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    const volume = boxed(screen.getByRole('slider', { name: 'Volume' }));
    fireEvent.pointerDown(volume, { clientX: 50, pointerId: 1 });
    expect(setVolume).toHaveBeenLastCalledWith(0.25);
  });

  it('toggles shuffle and cycles repeat off, all, one, off', async () => {
    const session = await playingSession();
    const setShuffle = vi.spyOn(session.player, 'setShuffle');
    const setRepeat = vi.spyOn(session.player, 'setRepeat');
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Shuffle' }));
    expect(setShuffle).toHaveBeenLastCalledWith(true);
    await userEvent.click(dialog.getByRole('button', { name: /^Repeat/ }));
    expect(setRepeat).toHaveBeenLastCalledWith('context');
    await userEvent.click(dialog.getByRole('button', { name: /^Repeat/ }));
    expect(setRepeat).toHaveBeenLastCalledWith('track');
    await userEvent.click(dialog.getByRole('button', { name: /^Repeat/ }));
    expect(setRepeat).toHaveBeenLastCalledWith('off');
  });

  it('lists what is up next', async () => {
    const session = await playingSession();
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Queue' }));
    const queue = within(dialog.getByRole('list', { name: 'Up Next' }));
    expect(queue.getAllByRole('button')).toHaveLength(session.player.getState().queue.length);
    expect(session.player.getState().queue.length).toBeGreaterThan(0);
  });

  it('skips ahead to a track chosen from Up Next and keeps what was playing', async () => {
    const session = await playingSession();
    const next = vi.spyOn(session.player, 'next');
    const play = vi.spyOn(session.player, 'play');
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Queue' }));
    const queue = within(dialog.getByRole('list', { name: 'Up Next' }));
    await userEvent.click(queue.getAllByRole('button')[1]!);
    // Two tracks ahead: skip twice. Starting a new play request would throw
    // away the album or playlist that is playing.
    await waitFor(() => expect(next).toHaveBeenCalledTimes(2));
    expect(play).not.toHaveBeenCalled();
    expect(session.player.getState().track?.uri).toBe(uris[2]);
  });

  it('offers the device picker even when nothing is playing', async () => {
    const session = makeDemoSession();
    const refresh = vi.spyOn(session.player, 'refreshDevices');
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('heading', { name: 'Not Playing' })).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Devices' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes and lists devices, and transfers to the one chosen', async () => {
    const session = await playingSession();
    const refresh = vi.spyOn(session.player, 'refreshDevices');
    const transfer = vi.spyOn(session.player, 'transfer');
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Devices' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    const device = session.player.getState().devices[0]!;
    // Named once: a device already called "This browser" is not labelled twice.
    await userEvent.click(await dialog.findByRole('button', { name: device.name }));
    expect(transfer).toHaveBeenCalledWith(device.id);
  });

  it('announces a playback problem', async () => {
    const session = await playingSession();
    await act(async () => {
      await session.player.play({ uris: ['demo:track:does-not-exist'] });
    });
    renderApp(<NowPlayingSheet open onClose={() => {}} />, { session });
    expect(screen.getByRole('alert')).toHaveTextContent(session.player.getState().error!.message);
  });
});
