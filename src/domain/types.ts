/**
 * The domain model and the two contracts every screen talks to. Both the demo
 * implementation and the Spotify implementation satisfy these, so no screen
 * knows which one it is running against.
 */

export type Image = { url: string; width?: number; height?: number };
export type ArtistRef = { id: string; name: string };
export type AlbumRef = {
  id: string;
  uri: string;
  name: string;
  artists: ArtistRef[];
  images: Image[];
  releaseDate?: string;
  albumType?: 'album' | 'single' | 'compilation';
};
export type Track = {
  id: string;
  uri: string;
  name: string;
  artists: ArtistRef[];
  album: AlbumRef;
  durationMs: number;
  explicit: boolean;
  playable: boolean;
};
export type Album = AlbumRef & { tracks: Track[]; label?: string; copyright?: string; externalUrl: string };
export type Artist = { id: string; uri: string; name: string; images: Image[]; externalUrl: string };
export type Playlist = {
  id: string;
  uri: string;
  name: string;
  description: string;
  images: Image[];
  ownerName: string;
  externalUrl: string;
};
/** tracks is null when Spotify withholds the list (playlist not owned by the user). */
export type PlaylistDetail = Playlist & { tracks: Track[] | null };
/**
 * next is an opaque cursor; pass it back unchanged to get the following page.
 * total, when the source knows it, is the size of the whole list.
 */
export type Page<T> = { items: T[]; next: string | null; total?: number };
export type ItemKind = 'album' | 'artist' | 'playlist' | 'track';
export type ShelfItem = { kind: ItemKind; id: string; uri: string; title: string; subtitle: string; image?: Image };
export type Shelf = { id: string; title: string; items: ShelfItem[] };
export type SearchResults = {
  tracks: Page<Track>;
  artists: Page<ShelfItem>;
  albums: Page<ShelfItem>;
  playlists: Page<ShelfItem>;
};
export type LibraryGroup = 'playlists' | 'artists' | 'albums';

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface MusicSource {
  me(): Promise<{ name: string; image?: Image }>;
  /** Only non-empty shelves, in display order. */
  home(): Promise<Shelf[]>;
  recentlyAdded(): Promise<ShelfItem[]>;
  library(group: LibraryGroup, cursor?: string): Promise<Page<ShelfItem>>;
  librarySongs(cursor?: string): Promise<Page<Track>>;
  album(id: string): Promise<Album>;
  playlist(id: string): Promise<PlaylistDetail>;
  artist(id: string): Promise<{ artist: Artist; albums: AlbumRef[]; singles: AlbumRef[] }>;
  /** With kind and cursor, only that group is filled; the others are empty pages. */
  search(query: string, kind?: ItemKind, cursor?: string): Promise<SearchResults>;
  isSaved(uris: string[]): Promise<boolean[]>;
  setSaved(uris: string[], saved: boolean): Promise<void>;
}

/** Shelf ids and titles shared by every MusicSource. */
export const SHELVES = {
  recent: 'Recently Played',
  'top-picks': 'Top Picks',
  'heavy-rotation': 'Heavy Rotation',
  'new-from-artists': 'New From Your Artists',
  playlists: 'Your Playlists',
} as const;
export type ShelfId = keyof typeof SHELVES;

export type RepeatMode = 'off' | 'context' | 'track';
export type Device = { id: string; name: string; type: string; active: boolean; isThisBrowser: boolean };
export type PlayerError = {
  kind: 'premium_required' | 'unsupported_browser' | 'auth' | 'playback';
  message: string;
};
export type PlayerState = {
  status: 'idle' | 'loading' | 'playing' | 'paused';
  track: Track | null;
  /** Playback position was positionMs at wall-clock time `at` (epoch ms). */
  positionMs: number;
  at: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** 0..1 */
  volume: number;
  queue: Track[];
  devices: Device[];
  error: PlayerError | null;
};
export type PlayTarget = { contextUri: string; offsetUri?: string } | { uris: string[]; index?: number };

export interface PlayerEngine {
  /** Returns the same object reference until something changes. */
  getState(): PlayerState;
  subscribe(listener: () => void): () => void;
  play(target: PlayTarget, opts?: { shuffle?: boolean }): Promise<void>;
  toggle(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  setShuffle(on: boolean): Promise<void>;
  setRepeat(mode: RepeatMode): Promise<void>;
  enqueue(uri: string): Promise<void>;
  refreshDevices(): Promise<void>;
  transfer(deviceId: string): Promise<void>;
  dispose(): void;
}

export type Session = { mode: 'demo' | 'spotify'; source: MusicSource; player: PlayerEngine };
