import {
  NotFoundError,
  SHELVES,
  type Album,
  type AlbumRef,
  type ItemKind,
  type LibraryGroup,
  type MusicSource,
  type Page,
  type PlaylistDetail,
  type SearchResults,
  type Shelf,
  type ShelfId,
  type ShelfItem,
  type Track,
} from '../domain/types';
import { readJSON, writeJSON } from '../lib/storage';
import { SpotifyError, type SpotifyClient } from './contract';
import { toAlbum, toAlbumRef, toArtist, toPlaylist, toShelfItem, toTrack } from './mappers';
import type {
  RawAlbum,
  RawArtist,
  RawMe,
  RawPaging,
  RawPlaylist,
  RawPlaylistDetail,
  RawPlaylistItem,
  RawTrack,
} from './raw';

const PAGE = 50;
const SEARCH_PAGE = 10;
const SEARCH_MAX_OFFSET = 1000;
const SAVE_CHUNK = 40;
const MAX_FOLLOW_ARTISTS = 10;
const NEW_ALBUMS_CAP = 20;
const RECENTLY_ADDED_CAP = 30;
const MAX_EXTRA_PAGES = 40;
const CACHE_KEY = 'pane.cache.newFromArtists';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type Cache = { at: number; items: ShelfItem[] };

export function createSpotifySource(deps: { client: SpotifyClient; now?: () => number; storage?: Storage }): MusicSource {
  const { client } = deps;
  const now = deps.now ?? Date.now;

  const items = <T>(p: RawPaging<T> | undefined | null): T[] => (p?.items ?? []).filter((x): x is T => x != null);
  const offsetOf = (cursor: string | undefined) => {
    const n = Number(cursor);
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  /** Cursor for the page after `offset`, or null on the last page. */
  const nextOffset = (raw: RawPaging<unknown>, offset: number, size: number) =>
    raw.next ? String(offset + size) : null;

  async function guard404<T>(p: Promise<T>): Promise<T> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof SpotifyError && e.status === 404) throw new NotFoundError();
      throw e;
    }
  }

  const trackPage = (raw: RawPaging<{ track?: RawTrack | null }>, offset: number): Page<Track> => ({
    items: items(raw)
      .map((x) => toTrack(x.track))
      .filter((t): t is Track => t !== null),
    next: nextOffset(raw, offset, PAGE),
  });

  // --- home shelves -------------------------------------------------------

  async function recent(): Promise<ShelfItem[]> {
    const raw = await client.get<RawPaging<{ track?: RawTrack | null }>>('/me/player/recently-played', { limit: PAGE });
    const seen = new Set<string>();
    const out: ShelfItem[] = [];
    for (const { track } of items(raw)) {
      const t = toTrack(track);
      if (!t || !t.album.id || seen.has(t.album.id)) continue;
      seen.add(t.album.id);
      out.push(toShelfItem(track!.album!, 'album'));
    }
    return out;
  }

  async function topPicks(): Promise<ShelfItem[]> {
    const raw = await client.get<RawPaging<RawTrack>>('/me/top/tracks', { time_range: 'short_term', limit: 20 });
    return items(raw)
      .filter((t) => toTrack(t))
      .map((t) => toShelfItem(t, 'track'));
  }

  const topArtists = (): Promise<RawArtist[]> =>
    client
      .get<RawPaging<RawArtist>>('/me/top/artists', { time_range: 'medium_term', limit: 20 })
      .then((raw) => items(raw));

  async function newFromArtists(top: Promise<RawArtist[]>): Promise<ShelfItem[]> {
    const cached = readJSON<Partial<Cache> | null>(CACHE_KEY, null, deps.storage);
    if (cached && typeof cached.at === 'number' && Array.isArray(cached.items)) {
      const age = now() - cached.at;
      if (age >= 0 && age < CACHE_TTL_MS) return cached.items;
    }

    const followed = await client
      .get<{ artists?: RawPaging<RawArtist> }>('/me/following', { type: 'artist', limit: MAX_FOLLOW_ARTISTS })
      .then((r) => items(r.artists))
      .catch(() => [] as RawArtist[]);
    const ids = [...new Set([...followed, ...(await top.catch(() => [] as RawArtist[]))].map((a) => a.id))].slice(
      0,
      MAX_FOLLOW_ARTISTS,
    );

    const results = await Promise.allSettled(
      ids.map((id) =>
        client.get<RawPaging<RawAlbum>>(`/artists/${id}/albums`, { include_groups: 'album,single', limit: 5 }),
      ),
    );
    const byId = new Map<string, RawAlbum>();
    for (const r of results) {
      if (r.status === 'fulfilled') for (const a of items(r.value)) byId.set(a.id, a);
    }
    const out = [...byId.values()]
      .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
      .slice(0, NEW_ALBUMS_CAP)
      .map((a) => toShelfItem(a, 'album'));

    // A partial result would stick for a day, so only a complete one is cached.
    if (out.length > 0 && results.every((r) => r.status === 'fulfilled')) {
      writeJSON(CACHE_KEY, { at: now(), items: out } satisfies Cache, deps.storage);
    }
    return out;
  }

  async function playlistsShelf(): Promise<ShelfItem[]> {
    const raw = await client.get<RawPaging<RawPlaylist>>('/me/playlists', { limit: 20, offset: 0 });
    return items(raw).map((p) => toShelfItem(p, 'playlist'));
  }

  // --- details ------------------------------------------------------------

  async function album(id: string): Promise<Album> {
    return guard404(
      (async () => {
        const raw = await client.get<RawAlbum>(`/albums/${id}`);
        const ref = toAlbumRef(raw);
        const first = raw.tracks ?? { items: [], next: null };
        const collected = [...first.items];
        let next = first.next;
        for (let i = 0; next && i < MAX_EXTRA_PAGES; i++) {
          const page: RawPaging<RawTrack> = await client.get(`/albums/${id}/tracks`, {
            limit: PAGE,
            offset: collected.length,
          });
          collected.push(...page.items);
          next = page.items.length > 0 ? page.next : null;
        }
        const tracks = collected.map((t) => toTrack(t, ref)).filter((t): t is Track => t !== null);
        return toAlbum(raw, tracks);
      })(),
    );
  }

  async function playlist(id: string): Promise<PlaylistDetail> {
    return guard404(
      (async () => {
        const raw = await client.get<RawPlaylistDetail>(`/playlists/${id}`);
        const base = toPlaylist(raw);
        if (!raw.items) return { ...base, tracks: null };

        const collected: (RawPlaylistItem | null)[] = [...raw.items.items];
        let next = raw.items.next;
        try {
          for (let i = 0; next && i < MAX_EXTRA_PAGES; i++) {
            const page: RawPaging<RawPlaylistItem> = await client.get(`/playlists/${id}/items`, {
              limit: PAGE,
              offset: collected.length,
            });
            collected.push(...page.items);
            next = page.items.length > 0 ? page.next : null;
          }
        } catch (e) {
          // 403: Spotify withholds the list from users who neither own nor collaborate.
          if (e instanceof SpotifyError && e.status === 403) return { ...base, tracks: null };
          throw e;
        }
        const tracks = collected
          .map((el) => toTrack(el?.item ?? el?.track))
          .filter((t): t is Track => t !== null);
        return { ...base, tracks };
      })(),
    );
  }

  async function artist(id: string) {
    return guard404(
      (async () => {
        const groups = (g: 'album' | 'single') =>
          client.get<RawPaging<RawAlbum>>(`/artists/${id}/albums`, { include_groups: g, limit: 10, offset: 0 });
        const [raw, albums, singles] = await Promise.all([
          client.get<RawArtist>(`/artists/${id}`),
          groups('album'),
          groups('single'),
        ]);
        const refs = (p: RawPaging<RawAlbum>): AlbumRef[] => items(p).map(toAlbumRef);
        return { artist: toArtist(raw), albums: refs(albums), singles: refs(singles) };
      })(),
    );
  }

  // --- library ------------------------------------------------------------

  async function library(group: LibraryGroup, cursor?: string): Promise<Page<ShelfItem>> {
    if (group === 'artists') {
      const raw = await client.get<{ artists?: RawPaging<RawArtist> & { cursors?: { after?: string | null } } }>(
        '/me/following',
        { type: 'artist', limit: PAGE, after: cursor },
      );
      const page = raw.artists;
      const after = page?.cursors?.after ?? null;
      return { items: items(page).map((a) => toShelfItem(a, 'artist')), next: page?.next && after ? after : null };
    }
    const offset = offsetOf(cursor);
    if (group === 'albums') {
      const raw = await client.get<RawPaging<{ album?: RawAlbum | null }>>('/me/albums', { limit: PAGE, offset });
      return {
        items: items(raw).flatMap((x) => (x.album ? [toShelfItem(x.album, 'album')] : [])),
        next: nextOffset(raw, offset, PAGE),
      };
    }
    const raw = await client.get<RawPaging<RawPlaylist>>('/me/playlists', { limit: PAGE, offset });
    return { items: items(raw).map((p) => toShelfItem(p, 'playlist')), next: nextOffset(raw, offset, PAGE) };
  }

  async function recentlyAdded(): Promise<ShelfItem[]> {
    const [albums, playlists] = await Promise.allSettled([
      client.get<RawPaging<{ added_at?: string; album?: RawAlbum | null }>>('/me/albums', { limit: PAGE, offset: 0 }),
      client.get<RawPaging<RawPlaylist>>('/me/playlists', { limit: PAGE, offset: 0 }),
    ]);
    if (albums.status === 'rejected' && playlists.status === 'rejected') throw albums.reason;
    const dated: { at: string; item: ShelfItem }[] = [];
    const undated: ShelfItem[] = [];
    if (albums.status === 'fulfilled') {
      for (const x of items(albums.value)) {
        if (!x.album) continue;
        const item = toShelfItem(x.album, 'album');
        if (x.added_at) dated.push({ at: x.added_at, item });
        else undated.push(item);
      }
    }
    if (playlists.status === 'fulfilled') {
      for (const p of items(playlists.value)) undated.push(toShelfItem(p, 'playlist'));
    }
    dated.sort((a, b) => b.at.localeCompare(a.at));
    return [...dated.map((d) => d.item), ...undated].slice(0, RECENTLY_ADDED_CAP);
  }

  // --- search -------------------------------------------------------------

  async function search(query: string, kind?: ItemKind, cursor?: string): Promise<SearchResults> {
    const emptyPage = { items: [], next: null };
    const none: SearchResults = { tracks: emptyPage, artists: emptyPage, albums: emptyPage, playlists: emptyPage };
    const q = query.trim();
    if (!q) return none;

    const offset = Math.min(offsetOf(cursor), SEARCH_MAX_OFFSET);
    const raw = await client.get<{
      tracks?: RawPaging<RawTrack>;
      artists?: RawPaging<RawArtist>;
      albums?: RawPaging<RawAlbum>;
      playlists?: RawPaging<RawPlaylist>;
    }>('/search', {
      q,
      type: kind ?? 'track,artist,album,playlist',
      limit: SEARCH_PAGE,
      offset,
    });
    const next = (p: RawPaging<unknown> | undefined) => {
      if (!p?.next) return null;
      const n = offset + SEARCH_PAGE;
      return n < SEARCH_MAX_OFFSET ? String(n) : null;
    };
    const want = (k: ItemKind) => kind === undefined || kind === k;
    return {
      tracks:
        raw.tracks && want('track')
          ? { items: items(raw.tracks).map((t) => toTrack(t)).filter((t): t is Track => t !== null), next: next(raw.tracks) }
          : emptyPage,
      artists:
        raw.artists && want('artist')
          ? { items: items(raw.artists).map((a) => toShelfItem(a, 'artist')), next: next(raw.artists) }
          : emptyPage,
      albums:
        raw.albums && want('album')
          ? { items: items(raw.albums).map((a) => toShelfItem(a, 'album')), next: next(raw.albums) }
          : emptyPage,
      playlists:
        raw.playlists && want('playlist')
          ? { items: items(raw.playlists).map((p) => toShelfItem(p, 'playlist')), next: next(raw.playlists) }
          : emptyPage,
    };
  }

  // --- saved state --------------------------------------------------------

  const chunks = (uris: string[]) => {
    const out: string[][] = [];
    for (let i = 0; i < uris.length; i += SAVE_CHUNK) out.push(uris.slice(i, i + SAVE_CHUNK));
    return out;
  };

  return {
    async me() {
      const raw = await client.get<RawMe>('/me');
      const image = raw.images?.find((i) => i?.url);
      return {
        name: raw.display_name || 'You',
        ...(image ? { image: { url: image.url } } : {}),
      };
    },

    async home(): Promise<Shelf[]> {
      const top = topArtists();
      top.catch(() => {}); // consumed below; this keeps a failure from being reported as unhandled
      const loaders: Record<ShelfId, () => Promise<ShelfItem[]>> = {
        recent,
        'top-picks': topPicks,
        'heavy-rotation': async () => (await top).map((a) => toShelfItem(a, 'artist')),
        'new-from-artists': () => newFromArtists(top),
        playlists: playlistsShelf,
      };
      const ids = Object.keys(SHELVES) as ShelfId[];
      const settled = await Promise.allSettled(ids.map((id) => loaders[id]()));
      // One failing shelf is left out quietly. But when the three independent
      // basics all fail, Spotify is unreachable (offline, rate-limited, signed
      // out) and "nothing here yet" would be a lie: reject so Home can say so.
      const core: ShelfId[] = ['recent', 'top-picks', 'playlists'];
      const failures = core.map((id) => settled[ids.indexOf(id)]).filter((r) => r?.status === 'rejected');
      if (failures.length === core.length) throw (failures[0] as PromiseRejectedResult).reason;
      return ids.flatMap((id, i) => {
        const r = settled[i];
        return r?.status === 'fulfilled' && r.value.length > 0 ? [{ id, title: SHELVES[id], items: r.value }] : [];
      });
    },

    recentlyAdded,
    library,

    async librarySongs(cursor) {
      const offset = offsetOf(cursor);
      return trackPage(await client.get('/me/tracks', { limit: PAGE, offset }), offset);
    },

    album,
    playlist,
    artist,
    search,

    async isSaved(uris) {
      const parts = await Promise.all(
        chunks(uris).map((c) => client.get<boolean[]>('/me/library/contains', { uris: c.join(',') })),
      );
      return parts.flat();
    },

    async setSaved(uris, saved) {
      for (const c of chunks(uris)) {
        const params = { uris: c.join(',') };
        if (saved) await client.put('/me/library', undefined, params);
        else await client.del('/me/library', undefined, params);
      }
    },
  };
}
