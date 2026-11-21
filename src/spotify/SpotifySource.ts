import {
  NotFoundError,
  SHELVES,
  type Album,
  type AlbumRef,
  type ItemKind,
  type LibraryGroup,
  type MusicSource,
  type Mix,
  type Page,
  type Playlist,
  type PlaylistDetail,
  type SearchResults,
  type Shelf,
  type ShelfId,
  type ShelfItem,
  type Track,
} from '../domain/types';
import { readJSON, writeJSON } from '../lib/storage';
import { SpotifyError, type SpotifyClient } from './contract';
import {
  mixToShelfItem,
  playlistToShelfItem,
  toAlbum,
  toAlbumRef,
  toArtist,
  toPlaylist,
  toShelfItem,
  toTrack,
} from './mappers';
import type {
  RawAlbum,
  RawArtist,
  RawMe,
  RawPaging,
  RawPlaylist,
  RawPlaylistDetail,
  RawPlayHistory,
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
const PLAYLIST_PAGES = 4;
const JUMP_BACK_IN_CAP = 12;
const PLAYLIST_LOOKUPS = 6;
const RECENT_TRACKS_CAP = 20;
const ARTIST_MIX_MIN_TRACKS = 6;
const ARTIST_MIX_CAP = 4;
const ARTIST_MIX_DESCRIPTION = 'Built from what you play';
const SPOTIFY_OWNER = 'spotify';
const FIXED_MIXES = [
  { id: 'on-repeat', range: 'short_term', title: 'On Repeat', description: 'What you play most right now' },
  { id: 'top-songs', range: 'medium_term', title: 'Your Top Songs', description: 'Your favourites of the last six months' },
  { id: 'all-time', range: 'long_term', title: 'All-Time Favourites', description: 'The songs you always come back to' },
] as const;
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
    total: typeof raw.total === 'number' ? raw.total : undefined,
  });

  // --- home shelves -------------------------------------------------------

  /** Every playlist Spotify has listed for the listener, kept so a 404 on one of them can be explained. */
  const libraryPlaylists = new Map<string, Playlist>();

  async function myPlaylistsPage(offset: number): Promise<RawPaging<RawPlaylist>> {
    const raw = await client.get<RawPaging<RawPlaylist>>('/me/playlists', { limit: PAGE, offset });
    for (const p of items(raw)) libraryPlaylists.set(p.id, toPlaylist(p));
    return raw;
  }

  /** The first page must load; a later page failing just ends the list early. */
  async function allMyPlaylists(): Promise<RawPlaylist[]> {
    let raw = await myPlaylistsPage(0);
    const out = items(raw);
    for (let page = 1; raw.next && page < PLAYLIST_PAGES; page++) {
      try {
        raw = await myPlaylistsPage(page * PAGE);
      } catch {
        break;
      }
      out.push(...items(raw));
    }
    return out;
  }
  const isSpotifyMade = (p: RawPlaylist) => p.owner?.id === SPOTIFY_OWNER;

  const recentPlays = (): Promise<RawPlayHistory[]> =>
    client.get<RawPaging<RawPlayHistory>>('/me/player/recently-played', { limit: PAGE }).then((raw) => items(raw));

  async function jumpBackIn(plays: Promise<RawPlayHistory[]>, mine: Promise<RawPlaylist[]>): Promise<ShelfItem[]> {
    type Entry = { uri: string; item: ShelfItem } | { uri: string; playlistId: string };
    const entries = new Map<string, Entry>();
    for (const play of await plays) {
      const t = toTrack(play.track);
      if (!t) continue;
      const context = /^spotify:(playlist|artist):(.+)$/.exec(play.context?.uri ?? '');
      let entry: Entry | null = null;
      if (context?.[1] === 'playlist' && context[2]) {
        entry = { uri: `spotify:playlist:${context[2]}`, playlistId: context[2] };
      } else if (context?.[1] === 'artist' && context[2]) {
        const name = t.artists.find((a) => a.id === context[2])?.name;
        if (name) {
          const uri = `spotify:artist:${context[2]}`;
          entry = { uri, item: { kind: 'artist', id: context[2], uri, title: name, subtitle: 'Artist' } };
        }
      } else if (t.album.id) {
        entry = { uri: t.album.uri, item: toShelfItem(play.track!.album!, 'album') };
      }
      if (entry && !entries.has(entry.uri)) entries.set(entry.uri, entry);
    }

    const known = new Map((await mine.catch(() => [] as RawPlaylist[])).map((p) => [p.id, toPlaylist(p)]));
    const unknown = [...entries.values()]
      .flatMap((e) => ('playlistId' in e && !known.has(e.playlistId) ? [e.playlistId] : []))
      .slice(0, PLAYLIST_LOOKUPS);
    const looked = await Promise.allSettled(unknown.map((id) => client.get<RawPlaylist>(`/playlists/${id}`)));
    looked.forEach((r, i) => {
      if (r.status === 'fulfilled') known.set(unknown[i]!, toPlaylist(r.value));
    });

    const out: ShelfItem[] = [];
    for (const e of entries.values()) {
      if ('item' in e) out.push(e.item);
      else {
        const p = known.get(e.playlistId);
        if (p) out.push(playlistToShelfItem(p));
      }
    }
    return out.slice(0, JUMP_BACK_IN_CAP);
  }

  async function recent(plays: Promise<RawPlayHistory[]>): Promise<ShelfItem[]> {
    const seen = new Set<string>();
    const out: ShelfItem[] = [];
    for (const { track } of await plays) {
      const t = toTrack(track);
      if (!t || seen.has(t.uri)) continue;
      seen.add(t.uri);
      out.push(toShelfItem(track!, 'track'));
    }
    return out.slice(0, RECENT_TRACKS_CAP);
  }

  // --- mixes --------------------------------------------------------------

  async function topTracks(range: string): Promise<Track[]> {
    const raw = await client.get<RawPaging<RawTrack>>('/me/top/tracks', { time_range: range, limit: PAGE });
    return items(raw)
      .map((t) => toTrack(t))
      .filter((t): t is Track => t !== null);
  }

  function makeMix(id: string, title: string, description: string, tracks: Track[]): Mix {
    const image = tracks[0]?.album.images[0];
    return { id, title, description, tracks, ...(image ? { image } : {}) };
  }

  const union = (lists: Track[][]): Track[] => {
    const byUri = new Map<string, Track>();
    for (const t of lists.flat()) if (!byUri.has(t.uri)) byUri.set(t.uri, t);
    return [...byUri.values()];
  };

  /** Settled results of the three ranges, in FIXED_MIXES order. Throws only when all three failed. */
  async function topTrackRanges(): Promise<PromiseSettledResult<Track[]>[]> {
    const settled = await Promise.allSettled(FIXED_MIXES.map((m) => topTracks(m.range)));
    if (settled.every((r) => r.status === 'rejected')) throw (settled[0] as PromiseRejectedResult).reason;
    return settled;
  }
  const fulfilled = (settled: PromiseSettledResult<Track[]>[]) =>
    settled.map((r) => (r.status === 'fulfilled' ? r.value : []));

  async function topMixes(): Promise<ShelfItem[]> {
    const lists = fulfilled(await topTrackRanges());
    const fixed = FIXED_MIXES.flatMap((m, i) => {
      const tracks = lists[i] ?? [];
      return tracks.length > 0 ? [makeMix(m.id, m.title, m.description, tracks)] : [];
    });

    const groups = new Map<string, { name: string; tracks: Track[] }>();
    for (const t of union(lists)) {
      for (const a of t.artists) {
        if (!a.id) continue;
        const g = groups.get(a.id) ?? { name: a.name, tracks: [] };
        g.tracks.push(t);
        groups.set(a.id, g);
      }
    }
    const artistMixes = [...groups.entries()]
      .filter(([, g]) => g.tracks.length >= ARTIST_MIX_MIN_TRACKS)
      .sort((x, y) => y[1].tracks.length - x[1].tracks.length)
      .slice(0, ARTIST_MIX_CAP)
      .map(([id, g]) => makeMix(`artist:${id}`, `${g.name} Mix`, ARTIST_MIX_DESCRIPTION, g.tracks));
    return [...fixed, ...artistMixes].map(mixToShelfItem);
  }

  async function mix(id: string): Promise<Mix> {
    const fixed = FIXED_MIXES.find((m) => m.id === id);
    if (fixed) {
      const tracks = await topTracks(fixed.range);
      if (tracks.length === 0) throw new NotFoundError();
      return makeMix(fixed.id, fixed.title, fixed.description, tracks);
    }
    const artistId = id.startsWith('artist:') ? id.slice('artist:'.length) : '';
    if (!artistId) throw new NotFoundError();
    const tracks = union(fulfilled(await topTrackRanges())).filter((t) => t.artists.some((a) => a.id === artistId));
    const name = tracks[0]?.artists.find((a) => a.id === artistId)?.name;
    if (!name) throw new NotFoundError();
    return makeMix(id, `${name} Mix`, ARTIST_MIX_DESCRIPTION, tracks);
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
    try {
      return await playlistDetail(id);
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
      // Spotify's own playlists 404 here even when they sit in the listener's library.
      if (libraryPlaylists.size === 0) await myPlaylistsPage(0).catch(() => undefined);
      const mine = libraryPlaylists.get(id);
      if (mine) return { ...mine, tracks: null };
      throw new NotFoundError();
    }
  }

  async function playlistDetail(id: string): Promise<PlaylistDetail> {
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
    const raw = await myPlaylistsPage(offset);
    return { items: items(raw).map((p) => toShelfItem(p, 'playlist')), next: nextOffset(raw, offset, PAGE) };
  }

  async function recentlyAdded(): Promise<ShelfItem[]> {
    const [albums, playlists] = await Promise.allSettled([
      client.get<RawPaging<{ added_at?: string; album?: RawAlbum | null }>>('/me/albums', { limit: PAGE, offset: 0 }),
      myPlaylistsPage(0),
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
      // Each of these is awaited by one or more shelves below; the catch keeps a
      // failure nobody reads from being reported as unhandled.
      const top = topArtists();
      const plays = recentPlays();
      const mine = allMyPlaylists();
      for (const p of [top, plays, mine]) p.catch(() => {});
      const loaders: Record<ShelfId, () => Promise<ShelfItem[]>> = {
        'jump-back-in': () => jumpBackIn(plays, mine),
        'made-for-you': async () => (await mine).filter(isSpotifyMade).map((p) => playlistToShelfItem(toPlaylist(p), 'Made for you by Spotify')),
        'top-mixes': topMixes,
        'new-releases': () => newFromArtists(top),
        recent: () => recent(plays),
        'favourite-artists': async () => (await top).map((a) => toShelfItem(a, 'artist')),
        playlists: async () =>
          (await mine).filter((p) => !isSpotifyMade(p)).map((p) => toShelfItem(p, 'playlist')),
      };
      const ids = Object.keys(SHELVES) as ShelfId[];
      const settled = await Promise.allSettled(ids.map((id) => loaders[id]()));
      // One failing shelf is left out quietly. But when the three independent
      // basics all fail, Spotify is unreachable (offline, rate-limited, signed
      // out) and "nothing here yet" would be a lie: reject so Home can say so.
      const core: ShelfId[] = ['recent', 'top-mixes', 'playlists'];
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
    mix,
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
