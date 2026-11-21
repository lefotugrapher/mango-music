import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackRow } from './TrackRow';
import { makeTrack } from '../test/fixtures';

describe('TrackRow', () => {
  it('shows the title, every artist, and the duration', () => {
    render(<TrackRow track={makeTrack()} index={3} onPlay={() => {}} />);
    expect(screen.getByText('Low Tide')).toBeInTheDocument();
    expect(screen.getByText('Mara Linden, Osei Park')).toBeInTheDocument();
    expect(screen.getByText('3:07')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('plays the track when clicked', async () => {
    const onPlay = vi.fn();
    const track = makeTrack();
    render(<TrackRow track={track} onPlay={onPlay} />);
    await userEvent.click(screen.getByRole('button', { name: /Low Tide/ }));
    expect(onPlay).toHaveBeenCalledWith(track);
  });

  it('marks explicit tracks', () => {
    render(<TrackRow track={makeTrack({ explicit: true })} onPlay={() => {}} />);
    expect(screen.getByLabelText('Explicit')).toHaveTextContent('E');
  });

  it('shows an unplayable track as disabled and does not play it', async () => {
    const onPlay = vi.fn();
    render(<TrackRow track={makeTrack({ playable: false })} onPlay={onPlay} />);
    const row = screen.getByRole('button', { name: /Low Tide/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(row);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('marks the row that is the current track', () => {
    render(<TrackRow track={makeTrack()} active playing onPlay={() => {}} />);
    expect(screen.getByRole('button', { name: /Low Tide/ })).toHaveAttribute('aria-current', 'true');
  });

  it('shows artwork only when asked', () => {
    const { rerender } = render(<TrackRow track={makeTrack()} onPlay={() => {}} />);
    expect(document.querySelector('[data-shape]')).toBeNull();
    rerender(<TrackRow track={makeTrack()} showArtwork onPlay={() => {}} />);
    expect(document.querySelector('[data-shape="square"]')).not.toBeNull();
  });
});
