import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Artwork } from './Artwork';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { IconButton } from './IconButton';
import { Shelf } from './Shelf';
import { SpotifyAttribution } from './SpotifyAttribution';
import { makeItem } from '../test/fixtures';

describe('Artwork', () => {
  it('keeps covers square by default', () => {
    render(<Artwork image={{ url: 'x.png' }} alt="Quiet Harbour" />);
    const img = screen.getByRole('img', { name: 'Quiet Harbour' });
    expect(img.closest('[data-shape]')).toHaveAttribute('data-shape', 'square');
  });

  it('draws a labelled placeholder when there is no image', () => {
    render(<Artwork alt="Untitled playlist" />);
    expect(screen.getByRole('img', { name: 'Untitled playlist' })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('Card', () => {
  it('never rounds an album or playlist cover into a circle', () => {
    const { rerender } = render(<Card item={makeItem({ kind: 'album' })} onOpen={() => {}} />);
    expect(document.querySelector('[data-shape]')).toHaveAttribute('data-shape', 'square');
    rerender(<Card item={makeItem({ kind: 'playlist' })} onOpen={() => {}} />);
    expect(document.querySelector('[data-shape]')).toHaveAttribute('data-shape', 'square');
  });

  it('shows artists as circles', () => {
    render(<Card item={makeItem({ kind: 'artist', title: 'Mara Linden', subtitle: 'Artist' })} onOpen={() => {}} />);
    expect(document.querySelector('[data-shape]')).toHaveAttribute('data-shape', 'circle');
  });

  it('opens the item when clicked', async () => {
    const onOpen = vi.fn();
    const item = makeItem();
    render(<Card item={item} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /Quiet Harbour/ }));
    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it('plays without opening when the play button is used', async () => {
    const onOpen = vi.fn();
    const onPlay = vi.fn();
    const item = makeItem();
    render(<Card item={item} onOpen={onOpen} onPlay={onPlay} />);
    await userEvent.click(screen.getByRole('button', { name: 'Play Quiet Harbour' }));
    expect(onPlay).toHaveBeenCalledWith(item);
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('Shelf', () => {
  it('renders a heading and one card per item', () => {
    render(
      <Shelf
        title="Recently Played"
        items={[makeItem({ id: 'a', title: 'One' }), makeItem({ id: 'b', title: 'Two' })]}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Recently Played' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders nothing at all when it has no items', () => {
    const { container } = render(<Shelf title="Recently Played" items={[]} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SpotifyAttribution', () => {
  it('links back to Spotify in a new tab without leaking the referrer', () => {
    render(<SpotifyAttribution href="https://open.spotify.com/album/1" />);
    const link = screen.getByRole('link', { name: /Open in Spotify/ });
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/album/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });
});

describe('IconButton', () => {
  it('is named by its label and reports a pressed state when it is a toggle', async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Shuffle" pressed onClick={onClick}>
        <svg />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Shuffle' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no pressed state when it is a plain button', () => {
    render(
      <IconButton label="Next" onClick={() => {}}>
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-pressed');
  });
});

describe('EmptyState', () => {
  it('shows a title, a body, and an action', () => {
    render(<EmptyState title="Nothing here yet" body="Play something." action={<button>Retry</button>} />);
    expect(screen.getByRole('heading', { name: 'Nothing here yet' })).toBeInTheDocument();
    expect(screen.getByText('Play something.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
