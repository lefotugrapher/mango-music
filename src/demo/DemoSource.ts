import {
  NotFoundError,
  SHELVES,
  type Album,
  type Artist,
  type ItemKind,
  type LibraryGroup,
  type MusicSource,
  type Page,
  type Playlist,
  type SearchResults,
  type Shelf,
  type ShelfId,
  type ShelfItem,
  type Track,
} from '../domain/types';
import { demoArtwork } from './artwork';
import { createDemoLibrary, type DemoLibrary } from './library';

const LIBRARY_PAGE = 20;
const SEARCH_PAGE = 10;

const albumItem = (a: Album): ShelfItem => ({
  kind: 'album', id: a.id, uri: a.uri, title: a.name,
  subtitle: a.artists.map((x) => x.name).join(', '), image: a.images[0],
});
const artistItem = (a: Artist): ShelfItem => ({
  kind: 'artist', id: a.id, uri: a.uri, title: a.name, subtitle: 'Artist', image: a.images[0],
});
const playlistItem = (p: Playlist): ShelfItem => ({
  kind: 'playlist', id: p.id, uri: p.uri, title: p.name, subtitle: p.ownerName, image: p.images[0],
});

// Cursors are opaque to callers; here they just encode an offset.
const encode = (offset: number) => `o${offset}`;
const decode = (cursor?: string) => {
  const n = cursor?.startsWith('o') ? Number(cursor.slice(1)) : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
};
function paginate<T>(all: T[], size: number, cursor?: string): Page<T> {
  const start = decode(cursor);
  const end = start + size;
  return { items: all.slice(start, end), next: end < all.length ? encode(end) : null };
}
const emptyPage = <T,>(): Page<T> => ({ items: [], next: null });

export function createDemoSource(lib: DemoLibrary = createDemoLibrary()): MusicSource {
  const saved = new Set<string>();
  for (const a of lib.albums.slice(0, 22)) saved.add(a.uri);
  lib.tracks.forEach((t, i) => {
    if (i % 5 === 0) saved.add(t.uri);
  });

  const find = <T,>(xs: T[], pred: (x: T) => boolean, what: string): T => {
    const hit = xs.find(pred);
    if (!hit) throw new NotFoundError(`${what} not found`);
    return hit;
  };
  const savedAlbums = () => lib.albums.filter((a) => saved.has(a.uri));
  const names = (t: Track) => t.artists.map((a) => a.name).join(' ');
  const newest = [...lib.albums].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));

  return {
    async me() {
      return { name: 'Demo Listener', image: { url: demoArtwork('me'), width: 600, height: 600 } };
    },

    async home() {
      const content: Record<ShelfId, ShelfItem[]> = {
        recent: lib.albums.slice(0, 8).map(albumItem),
        'top-picks': lib.albums.slice(8, 16).map(albumItem),
        'heavy-rotation': lib.albums.slice(16, 24).map(albumItem),
        'new-from-artists': newest.slice(0, 8).map(albumItem),
        playlists: lib.playlists.map((p) => playlistItem(p.playlist)),
      };
      return (Object.keys(SHELVES) as ShelfId[]).map<Shelf>((id) => ({
        id,
        title: SHELVES[id],
        items: content[id],
      }));
    },

    async recentlyAdded() {
      return savedAlbums().slice(-12).reverse().map(albumItem);
    },

    async library(group: LibraryGroup, cursor?: string) {
      const all =
        group === 'albums'
          ? savedAlbums().map(albumItem)
          : group === 'artists'
            ? lib.artists.map(artistItem)
            : lib.playlists.map((p) => playlistItem(p.playlist));
      return paginate(all, LIBRARY_PAGE, cursor);
    },

    async librarySongs(cursor?: string) {
      return paginate(lib.tracks.filter((t) => saved.has(t.uri)), LIBRARY_PAGE, cursor);
    },

    async album(id) {
      return find(lib.albums, (a) => a.id === id, 'Album');
    },

    async playlist(id) {
      const p = find(lib.playlists, (x) => x.playlist.id === id, 'Playlist');
      return { ...p.playlist, tracks: p.owned ? p.tracks : null };
    },

    async artist(id) {
      const artist = find(lib.artists, (a) => a.id === id, 'Artist');
      const mine = lib.albums.filter((a) => a.artists.some((x) => x.id === id));
      return {
        artist,
        albums: mine.filter((a) => a.albumType !== 'single').map(({ tracks: _t, ...ref }) => ref),
        singles: mine.filter((a) => a.albumType === 'single').map(({ tracks: _t, ...ref }) => ref),
      };
    },

    async search(query, kind?: ItemKind, cursor?: string): Promise<SearchResults> {
      const q = query.trim().toLowerCase();
      const out: SearchResults = {
        tracks: emptyPage(), artists: emptyPage(), albums: emptyPage(), playlists: emptyPage(),
      };
      if (!q) return out;
      const has = (s: string) => s.toLowerCase().includes(q);
      const want = (k: ItemKind) => !kind || kind === k;
      if (want('track')) {
        out.tracks = paginate(lib.tracks.filter((t) => has(t.name) || has(names(t))), SEARCH_PAGE, cursor);
      }
      if (want('artist')) {
        out.artists = paginate(lib.artists.filter((a) => has(a.name)).map(artistItem), SEARCH_PAGE, cursor);
      }
      if (want('album')) {
        const hits = lib.albums.filter((a) => has(a.name) || a.artists.some((x) => has(x.name)));
        out.albums = paginate(hits.map(albumItem), SEARCH_PAGE, cursor);
      }
      if (want('playlist')) {
        const hits = lib.playlists.filter((p) => has(p.playlist.name));
        out.playlists = paginate(hits.map((p) => playlistItem(p.playlist)), SEARCH_PAGE, cursor);
      }
      return out;
    },

    async isSaved(uris) {
      return uris.map((u) => saved.has(u));
    },

    async setSaved(uris, on) {
      for (const u of uris) {
        if (on) saved.add(u);
        else saved.delete(u);
      }
    },
  };
}
