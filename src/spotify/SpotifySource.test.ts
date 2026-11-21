import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../domain/types';
import { SpotifyError, type Params, type SpotifyClient } from './contract';
import { createSpotifySource } from './SpotifySource';

type Call = { method: 'get' | 'put' | 'post' | 'del'; path: string; params?: Params; body?: unknown };
type Route = unknown | ((c: Call) => unknown);

/** Unknown paths 404, like the real API for a missing resource. */
function fakeClient(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const run = async (c: Call) => {
    calls.push(c);
    if (!(c.path in routes)) throw new SpotifyError(404, 'not_found');
    const r = routes[c.path];
    return typeof r === 'function' ? (r as (c: Call) => unknown)(c) : r;
  };
  const client: SpotifyClient = {
    get: ((path: string, params?: Params) => run({ method: 'get', path, params })) as SpotifyClient['get'],
    put: async (path, body, params) => void (await run({ method: 'put', path, params, body })),
    post: async (path, body, params) => void (await run({ method: 'post', path, params, body })),
    del: async (path, body, params) => void (await run({ method: 'del', path, params, body })),
  };
  return { client, calls, routes };
}

const paging = <T>(items: (T | null)[], next: string | null = null) => ({ items, next });
const empty = paging([]);
const homeBase = (): Record<string, Route> => ({
  '/me/player/recently-played': empty,
  '/me/top/tracks': empty,
  '/me/top/artists': empty,
  '/me/playlists': empty,
  '/me/following': { artists: { items: [], next: null, cursors: {} } },
});

const album = (id: string, extra: Record<string, unknown> = {}) => ({
  id, uri: `spotify:album:${id}`, name: `Album ${id}`, album_type: 'album', release_date: '2024-01-01',
  images: [{ url: `http://img/${id}` }], artists: [{ id: 'a', name: 'Ann' }], ...extra,
});
const track = (id: string, extra: Record<string, unknown> = {}) => ({
  id, uri: `spotify:track:${id}`, name: `Track ${id}`, type: 'track', duration_ms: 1000, explicit: false,
  artists: [{ id: 'a', name: 'Ann' }], album: album('alb'), ...extra,
});
const artist = (id: string) => ({ id, uri: `spotify:artist:${id}`, name: `Artist ${id}`, images: [] });

const DAY = 24 * 60 * 60 * 1000;
let storage: Storage;
beforeEach(() => {
  storage = window.localStorage;
});

describe('home() when Spotify cannot be reached', () => {
  const fail = () => {
    throw new SpotifyError(0, 'network');
  };

  it('rejects when every core request fails, so Home can offer a retry instead of looking empty', async () => {
    const { client } = fakeClient({
      '/me/player/recently-played': fail,
      '/me/top/tracks': fail,
      '/me/top/artists': fail,
      '/me/playlists': fail,
      '/me/following': fail,
    });
    await expect(createSpotifySource({ client, storage }).home()).rejects.toMatchObject({ reason: 'network' });
  });

  it('still resolves when only some requests fail', async () => {
    const { client } = fakeClient({ ...homeBase(), '/me/player/recently-played': fail, '/me/top/tracks': fail });
    await expect(createSpotifySource({ client, storage }).home()).resolves.toEqual([]);
  });
});

describe('home()', () => {
  it('resolves with only non-empty shelves when one shelf is forbidden and the rest are empty', async () => {
    const { client } = fakeClient({
      ...homeBase(),
      '/me/player/recently-played': () => {
        throw new SpotifyError(403, 'forbidden');
      },
      '/me/playlists': paging([{ id: 'p1', uri: 'spotify:playlist:p1', name: 'Mix', owner: { display_name: 'Kay' } }]),
    });
    const shelves = await createSpotifySource({ client, storage }).home();
    expect(shelves.map((s) => s.id)).toEqual(['playlists']);
    expect(shelves[0]).toMatchObject({ title: 'Your Playlists', items: [{ kind: 'playlist', subtitle: 'Kay' }] });
  });

  it('rejects rather than looking empty when every shelf request fails', async () => {
    // An account with nothing in it answers with empty lists, not errors. Every
    // request failing means Spotify could not be reached, and Home must say so.
    const { client } = fakeClient({});
    await expect(createSpotifySource({ client, storage }).home()).rejects.toBeInstanceOf(SpotifyError);
  });

  it('de-duplicates recently played by album, most recent first, skipping dirty items', async () => {
    const { client } = fakeClient({
      ...homeBase(),
      '/me/player/recently-played': paging([
        { track: track('1', { album: album('x') }) },
        { track: track('2', { album: album('y') }) },
        { track: track('3', { album: album('x') }) },
        { track: null },
        { track: track('4', { type: 'episode', album: album('z') }) },
        { track: track('5', { id: null, album: album('w') }) },
      ]),
    });
    const [shelf] = await createSpotifySource({ client, storage }).home();
    expect(shelf?.id).toBe('recent');
    expect(shelf?.items.map((i) => i.id)).toEqual(['x', 'y']);
    expect(shelf?.items[0]).toMatchObject({ kind: 'album', subtitle: 'Ann' });
  });

  it('builds top picks from short_term and heavy rotation from medium_term', async () => {
    const { client, calls } = fakeClient({
      ...homeBase(),
      '/me/top/tracks': paging([track('1')]),
      '/me/top/artists': paging([artist('9')]),
    });
    const shelves = await createSpotifySource({ client, storage }).home();
    expect(shelves.map((s) => s.id)).toEqual(['top-picks', 'heavy-rotation']);
    expect(calls.find((c) => c.path === '/me/top/tracks')?.params).toMatchObject({ time_range: 'short_term' });
    expect(calls.find((c) => c.path === '/me/top/artists')?.params).toMatchObject({ time_range: 'medium_term' });
  });

  describe('new from your artists', () => {
    const artistIds = Array.from({ length: 12 }, (_, i) => `ar${i}`);
    function routes(extra: Record<string, Route> = {}) {
      const r: Record<string, Route> = {
        ...homeBase(),
        '/me/following': { artists: { items: artistIds.map(artist), next: null, cursors: {} } },
      };
      for (const id of artistIds) {
        r[`/artists/${id}/albums`] = paging([
          album(`${id}-old`, { release_date: '2020-01-01' }),
          album(`shared`, { release_date: '2023-06-01' }),
          album(`${id}-new`, { release_date: `2024-${String(artistIds.indexOf(id) + 1).padStart(2, '0')}-01` }),
        ]);
      }
      return { ...r, ...extra };
    }
    const albumCalls = (calls: Call[]) => calls.filter((c) => /^\/artists\/.+\/albums$/.test(c.path));

    it('asks for at most 10 artists, album+single, limit 5; merges, de-duplicates, sorts newest first, caps at 20', async () => {
      const { client, calls } = fakeClient(routes());
      const shelves = await createSpotifySource({ client, storage }).home();
      const shelf = shelves.find((s) => s.id === 'new-from-artists');
      const ac = albumCalls(calls);
      expect(ac).toHaveLength(10);
      expect(ac.every((c) => c.params?.include_groups === 'album,single' && c.params?.limit === 5)).toBe(true);
      const ids = shelf!.items.map((i) => i.id);
      expect(ids).toHaveLength(20);
      expect(new Set(ids).size).toBe(20);
      expect(ids[0]).toBe('ar9-new');
      expect(ids.indexOf('ar9-new')).toBeLessThan(ids.indexOf('ar0-new'));
      expect(ids.indexOf('shared')).toBeGreaterThan(ids.indexOf('ar0-new'));
    });

    it('uses the cache for 24 hours, then fetches again', async () => {
      let t = 1_000_000;
      const first = fakeClient(routes());
      await createSpotifySource({ client: first.client, storage, now: () => t }).home();
      expect(albumCalls(first.calls).length).toBe(10);
      expect(JSON.parse(storage.getItem('pane.cache.newFromArtists')!)).toMatchObject({ at: t });

      t += DAY - 1000;
      const second = fakeClient(routes());
      const cached = await createSpotifySource({ client: second.client, storage, now: () => t }).home();
      expect(albumCalls(second.calls)).toHaveLength(0);
      expect(cached.find((s) => s.id === 'new-from-artists')?.items.length).toBe(20);

      t += 2000;
      const third = fakeClient(routes());
      await createSpotifySource({ client: third.client, storage, now: () => t }).home();
      expect(albumCalls(third.calls)).toHaveLength(10);
    });

    it('ignores a malformed cache value', async () => {
      storage.setItem('pane.cache.newFromArtists', '{"at":"yesterday","items":7}');
      const { client, calls } = fakeClient(routes());
      const shelves = await createSpotifySource({ client, storage }).home();
      expect(albumCalls(calls)).toHaveLength(10);
      expect(shelves.some((s) => s.id === 'new-from-artists')).toBe(true);
    });

    it('keeps the shelf when one artist request fails', async () => {
      const { client } = fakeClient(
        routes({
          '/artists/ar0/albums': () => {
            throw new SpotifyError(500);
          },
        }),
      );
      const shelf = (await createSpotifySource({ client, storage }).home()).find((s) => s.id === 'new-from-artists');
      expect(shelf?.items.length).toBeGreaterThan(0);
    });

    it('falls back to top artists for an account that follows nobody', async () => {
      const { client, calls } = fakeClient(
        routes({
          '/me/following': { artists: { items: [], next: null, cursors: {} } },
          '/me/top/artists': paging([artist('ar1'), artist('ar2')]),
        }),
      );
      await createSpotifySource({ client, storage }).home();
      expect(albumCalls(calls).map((c) => c.path).sort()).toEqual(['/artists/ar1/albums', '/artists/ar2/albums']);
    });
  });
});

describe('library', () => {
  it('artists follow the after cursor and end with null', async () => {
    const { client, calls } = fakeClient({
      '/me/following': (c: Call) =>
        c.params?.after === undefined
          ? { artists: { items: [artist('a1')], next: 'https://x', cursors: { after: 'a1' } } }
          : { artists: { items: [artist('a2')], next: null, cursors: { after: null } } },
    });
    const src = createSpotifySource({ client, storage });
    const p1 = await src.library('artists');
    expect(p1.next).toBe('a1');
    expect(calls[0]?.params).toMatchObject({ type: 'artist', limit: 50 });
    const p2 = await src.library('artists', p1.next!);
    expect(calls[1]?.params?.after).toBe('a1');
    expect(p2).toMatchObject({ items: [{ id: 'a2', kind: 'artist' }], next: null });
  });

  it('albums and songs page by offset; the last page has next null', async () => {
    const { client, calls } = fakeClient({
      '/me/albums': (c: Call) =>
        c.params?.offset ? paging([{ album: album('b') }]) : paging([{ added_at: '2024-01-01', album: album('a') }], 'https://x'),
      '/me/tracks': (c: Call) =>
        c.params?.offset ? paging([{ track: track('t2') }]) : paging([{ track: track('t1') }, { track: null }], 'https://x'),
    });
    const src = createSpotifySource({ client, storage });
    const a1 = await src.library('albums');
    expect(a1.next).toBe('50');
    const a2 = await src.library('albums', a1.next!);
    expect(calls.at(-1)?.params?.offset).toBe(50);
    expect(a2).toMatchObject({ items: [{ id: 'b' }], next: null });

    const s1 = await src.librarySongs();
    expect(s1.items.map((t) => t.id)).toEqual(['t1']);
    expect(s1.next).toBe('50');
    expect((await src.librarySongs(s1.next!)).next).toBeNull();
  });

  it('playlists use /me/playlists with an offset', async () => {
    const { client, calls } = fakeClient({
      '/me/playlists': paging([{ id: 'p', uri: 'spotify:playlist:p', name: 'P', images: null, owner: { id: 'u' } }]),
    });
    const page = await createSpotifySource({ client, storage }).library('playlists', '50');
    expect(calls[0]?.params).toMatchObject({ limit: 50, offset: 50 });
    expect(page.items[0]).toMatchObject({ kind: 'playlist', subtitle: 'u' });
  });

  it('recentlyAdded merges albums and playlists, dated newest first, capped at 30', async () => {
    const albums = Array.from({ length: 40 }, (_, i) => ({
      added_at: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      album: album(`a${i}`),
    }));
    const { client } = fakeClient({
      '/me/albums': paging(albums),
      '/me/playlists': paging([{ id: 'p', uri: 'spotify:playlist:p', name: 'P', owner: { id: 'u' } }]),
    });
    const items = await createSpotifySource({ client, storage }).recentlyAdded();
    expect(items).toHaveLength(30);
    expect(items[0]?.id).toBe('a27');
  });
});

describe('details', () => {
  it('album: loads remaining tracks from /albums/{id}/tracks and passes the album in', async () => {
    const simple = (id: string) => {
      const { album: _a, ...rest } = track(id);
      return rest;
    };
    const { client, calls } = fakeClient({
      '/albums/al': album('al', {
        label: 'L',
        tracks: paging([simple('t1'), simple('t2')], 'https://next'),
        external_urls: { spotify: 'http://o/al' },
      }),
      '/albums/al/tracks': paging([simple('t3'), { ...simple('t4'), is_playable: false }]),
    });
    const a = await createSpotifySource({ client, storage }).album('al');
    expect(calls[1]).toMatchObject({ path: '/albums/al/tracks', params: { limit: 50, offset: 2 } });
    expect(a.tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(a.tracks[3]?.playable).toBe(false);
    expect(a.tracks[0]?.album.id).toBe('al');
    expect(a).toMatchObject({ label: 'L', externalUrl: 'http://o/al' });
  });

  it('album/playlist/artist 404 becomes NotFoundError', async () => {
    const src = createSpotifySource({ client: fakeClient({}).client, storage });
    await expect(src.album('missing')).rejects.toBeInstanceOf(NotFoundError);
    await expect(src.playlist('missing')).rejects.toBeInstanceOf(NotFoundError);
    await expect(src.artist('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('other errors pass through unchanged', async () => {
    const { client } = fakeClient({
      '/albums/x': () => {
        throw new SpotifyError(500);
      },
    });
    await expect(createSpotifySource({ client, storage }).album('x')).rejects.toBeInstanceOf(SpotifyError);
  });

  const pl = { id: 'p', uri: 'spotify:playlist:p', name: 'P', description: null, images: null, owner: { id: 'u' } };

  it('playlist without an items field has tracks null', async () => {
    const { client, calls } = fakeClient({ '/playlists/p': pl });
    const d = await createSpotifySource({ client, storage }).playlist('p');
    expect(d.tracks).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('playlist drops null elements, null items, local files and episodes; reads item ?? track', async () => {
    const { client } = fakeClient({
      '/playlists/p': {
        ...pl,
        items: paging([
          null,
          { added_at: 'x', item: null },
          { item: track('t1') },
          { track: track('t2') },
          { item: track('t3', { id: null, is_local: true }) },
          { item: track('t4', { type: 'episode' }) },
          { item: track('t5', { is_playable: false }) },
        ]),
      },
    });
    const d = await createSpotifySource({ client, storage }).playlist('p');
    expect(d.tracks?.map((t) => [t.id, t.playable])).toEqual([['t1', true], ['t2', true], ['t5', false]]);
  });

  it('playlist loads later pages by raw offset', async () => {
    const { client, calls } = fakeClient({
      '/playlists/p': { ...pl, items: paging([{ item: track('t1') }, null], 'https://n') },
      '/playlists/p/items': paging([{ item: track('t2') }]),
    });
    const d = await createSpotifySource({ client, storage }).playlist('p');
    expect(calls[1]).toMatchObject({ path: '/playlists/p/items', params: { limit: 50, offset: 2 } });
    expect(d.tracks?.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('playlist /items 403 means withheld: tracks null', async () => {
    const { client } = fakeClient({
      '/playlists/p': { ...pl, items: paging([{ item: track('t1') }], 'https://n') },
      '/playlists/p/items': () => {
        throw new SpotifyError(403, 'forbidden');
      },
    });
    expect((await createSpotifySource({ client, storage }).playlist('p')).tracks).toBeNull();
  });

  it('artist requests albums and singles separately with limit 10', async () => {
    const { client, calls } = fakeClient({
      '/artists/ar': artist('ar'),
      '/artists/ar/albums': (c: Call) =>
        paging([c.params?.include_groups === 'single' ? album('s1', { album_type: 'single' }) : album('a1')]),
    });
    const r = await createSpotifySource({ client, storage }).artist('ar');
    const groups = calls.filter((c) => c.path.endsWith('/albums')).map((c) => [c.params?.include_groups, c.params?.limit]);
    expect(groups).toEqual(expect.arrayContaining([['album', 10], ['single', 10]]));
    expect(r.albums.map((a) => a.id)).toEqual(['a1']);
    expect(r.singles.map((a) => a.id)).toEqual(['s1']);
    expect(r.artist.id).toBe('ar');
  });
});

describe('search', () => {
  const results = {
    tracks: paging([track('t1'), null], 'https://n'),
    artists: paging([artist('a1'), null]),
    albums: paging([album('al1')]),
    playlists: paging([null, { id: 'p', uri: 'spotify:playlist:p', name: 'P', owner: { id: 'u' } }]),
  };

  it('makes one request across all types with limit 10 and drops nulls', async () => {
    const { client, calls } = fakeClient({ '/search': results });
    const r = await createSpotifySource({ client, storage }).search('hello');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toMatchObject({ q: 'hello', type: 'track,artist,album,playlist', limit: 10 });
    expect(r.tracks.items.map((t) => t.id)).toEqual(['t1']);
    expect(r.tracks.next).toBe('10');
    expect(r.playlists.items.map((i) => i.id)).toEqual(['p']);
    expect(r.artists.items[0]).toMatchObject({ kind: 'artist' });
  });

  it('with a kind and cursor requests only that group, others empty', async () => {
    const { client, calls } = fakeClient({ '/search': { albums: paging([album('al2')], 'https://n') } });
    const r = await createSpotifySource({ client, storage }).search('hello', 'album', '10');
    expect(calls[0]?.params).toMatchObject({ type: 'album', offset: 10, limit: 10 });
    expect(r.albums).toMatchObject({ items: [{ id: 'al2' }], next: '20' });
    expect(r.tracks).toEqual({ items: [], next: null });
    expect(r.artists).toEqual({ items: [], next: null });
  });

  it('stops paging at the API offset limit of 1000', async () => {
    const { client } = fakeClient({ '/search': { albums: paging([album('al2')], 'https://n') } });
    const r = await createSpotifySource({ client, storage }).search('q', 'album', '990');
    expect(r.albums.next).toBeNull();
  });

  it('a blank query makes no request', async () => {
    const { client, calls } = fakeClient({ '/search': results });
    const r = await createSpotifySource({ client, storage }).search('   ');
    expect(calls).toHaveLength(0);
    expect(r.tracks.items).toEqual([]);
  });
});

describe('saved state', () => {
  const uris = Array.from({ length: 85 }, (_, i) => `spotify:track:${i}`);

  it.each([true, false])('setSaved(%s) chunks by 40 with uris as a query param and no body', async (saved) => {
    const { client, calls } = fakeClient({ '/me/library': undefined });
    await createSpotifySource({ client, storage }).setSaved(uris, saved);
    expect(calls.map((c) => c.method)).toEqual(Array(3).fill(saved ? 'put' : 'del'));
    expect(calls.map((c) => String(c.params?.uris).split(',').length)).toEqual([40, 40, 5]);
    expect(calls.every((c) => c.body === undefined)).toBe(true);
    expect(String(calls[0]?.params?.uris).startsWith('spotify:track:0,spotify:track:1,')).toBe(true);
  });

  it('isSaved flattens chunked results in order', async () => {
    const { client, calls } = fakeClient({
      '/me/library/contains': (c: Call) => String(c.params?.uris).split(',').map((u) => Number(u.split(':')[2]) % 2 === 0),
    });
    const out = await createSpotifySource({ client, storage }).isSaved(uris);
    expect(calls).toHaveLength(3);
    expect(out).toHaveLength(85);
    expect(out.slice(0, 4)).toEqual([true, false, true, false]);
    expect(out[84]).toBe(true);
  });

  it('empty input makes no request', async () => {
    const { client, calls } = fakeClient({});
    const src = createSpotifySource({ client, storage });
    expect(await src.isSaved([])).toEqual([]);
    await src.setSaved([], true);
    expect(calls).toHaveLength(0);
  });
});

describe('me()', () => {
  it('maps display_name and the first image', async () => {
    const { client } = fakeClient({ '/me': { id: 'u', display_name: 'Kay', images: [{ url: 'http://me' }] } });
    expect(await createSpotifySource({ client, storage }).me()).toEqual({ name: 'Kay', image: { url: 'http://me' } });
  });
  it('falls back to "You" when display_name is null', async () => {
    const { client } = fakeClient({ '/me': { id: 'u', display_name: null, images: [] } });
    expect(await createSpotifySource({ client, storage }).me()).toEqual({ name: 'You' });
  });
});
