import type { AlbumRef, ShelfItem, Track } from '../domain/types';

export function makeAlbumRef(overrides: Partial<AlbumRef> = {}): AlbumRef {
  return {
    id: 'al1',
    uri: 'test:album:al1',
    name: 'Quiet Harbour',
    artists: [{ id: 'ar1', name: 'Mara Linden' }],
    images: [{ url: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E', width: 600, height: 600 }],
    releaseDate: '2025-04-11',
    albumType: 'album',
    ...overrides,
  };
}

export function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    uri: 'test:track:t1',
    name: 'Low Tide',
    artists: [
      { id: 'ar1', name: 'Mara Linden' },
      { id: 'ar2', name: 'Osei Park' },
    ],
    album: makeAlbumRef(),
    durationMs: 187000,
    explicit: false,
    playable: true,
    ...overrides,
  };
}

export function makeItem(overrides: Partial<ShelfItem> = {}): ShelfItem {
  return {
    kind: 'album',
    id: 'al1',
    uri: 'test:album:al1',
    title: 'Quiet Harbour',
    subtitle: 'Mara Linden',
    image: { url: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E' },
    ...overrides,
  };
}
