import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, SHELVES, type ShelfId } from '../domain/types';
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

describe('librarySongs() size', () => {
  it("reports how many songs are liked in total, not just this page's", async () => {
    const { client } = fakeClient({ '/me/tracks': { items: [{ track: track('1') }], next: 'more', total: 1240 } });
    const page = await createSpotifySource({ client, storage }).librarySongs();
    expect(page.total).toBe(1240);
    expect(page.items).toHaveLength(1);
  });
});

const ctx = (uri: string) => ({ uri, type: uri.split(':')[1] });
const play = (t: unknown, context?: string) => ({ track: t, context: context ? ctx(context) : null });
const plRaw = (id: string, owner = 'u', extra: Record<string, unknown> = {}) => ({
  id, uri: `spotify:playlist:${id}`, name: `Playlist ${id}`, owner: { id: owner, display_name: owner === 'spotify' ? 'Spotify' : `Owner ${owner}` },
  images: [{ url: `http://pl/${id}` }], ...extra,
});
const shelfOf = async (routes: Record<string, Route>, id: string) => {
  const { client, calls } = fakeClient(routes);
  const shelves = await createSpotifySource({ client, storage }).home();
  return { shelf: shelves.find((s) => s.id === id), shelves, calls };
};
const ranges = (lists: { short?: unknown[]; medium?: unknown[]; long?: unknown[] }): Route => (c: Call) => {
  const r = { short_term: lists.short, medium_term: lists.medium, long_term: lists.long }[String(c.params?.time_range)];
  if (!r) throw new SpotifyError(500);
  return paging(r);
};
const by = (artistId: string, n: number, from = 0) =>
  Array.from({ length: n }, (_, i) =>
    track(`${artistId}${from + i}`, { artists: [{ id: artistId, name: `Name ${artistId}` }] }),
  );

describe('home() when Spotify cannot be reached', () => {
  const fail = () => {
    throw new SpotifyError(0, 'network');
  };

  it('rejects when recent, top-mixes and playlists all fail, so Home can offer a retry instead of looking empty', async () => {
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

  it('still resolves when only the playlists request fails', async () => {
    const { client } = fakeClient({
      ...homeBase(),
      '/me/playlists': fail,
      '/me/player/recently-played': paging([play(track('1'))]),
    });
    const shelves = await createSpotifySource({ client, storage }).home();
    expect(shelves.map((s) => s.id)).toEqual(['jump-back-in', 'recent']);
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

  it('returns shelves in SHELVES order with the SHELVES titles', async () => {
    const { shelves } = await shelfOf(
      {
        ...homeBase(),
        '/me/player/recently-played': paging([play(track('1'))]),
        '/me/top/tracks': paging([track('1')]),
        '/me/top/artists': paging([artist('9')]),
        '/me/playlists': paging([plRaw('p1'), plRaw('s1', 'spotify')]),
        '/me/following': { artists: { items: [artist('9')], next: null, cursors: {} } },
        '/artists/9/albums': paging([album('n1')]),
      },
      'recent',
    );
    const ids = shelves.map((s) => s.id);
    const order = Object.keys(SHELVES);
    expect(ids).toEqual(order.filter((id) => ids.includes(id)));
    expect(ids).toEqual(['jump-back-in', 'made-for-you', 'top-mixes', 'new-releases', 'recent', 'favourite-artists', 'playlists']);
    expect(shelves.map((s) => s.title)).toEqual(ids.map((id) => SHELVES[id as ShelfId]));
  });

  describe('jump back in', () => {
    const unknownPlaylist = (id: string) => [`/playlists/${id}`, plRaw(id, 'z')] as const;

    it('mixes album, playlist and artist contexts, newest first', async () => {
      const { shelf, calls } = await shelfOf(
        {
          ...homeBase(),
          '/me/player/recently-played': paging([
            play(track('1', { album: album('x') }), 'spotify:album:x'),
            play(track('2'), 'spotify:playlist:p1'),
            play(track('3', { artists: [{ id: 'q', name: 'Quinn' }, { id: 'a', name: 'Ann' }] }), 'spotify:artist:a'),
            play(track('4', { album: album('y') })),
          ]),
          '/me/playlists': paging([plRaw('p1', 'u')]),
        },
        'jump-back-in',
      );
      expect(shelf?.items.map((i) => [i.kind, i.id, i.uri, i.title, i.subtitle])).toEqual([
        ['album', 'x', 'spotify:album:x', 'Album x', 'Ann'],
        ['playlist', 'p1', 'spotify:playlist:p1', 'Playlist p1', 'Owner u'],
        ['artist', 'a', 'spotify:artist:a', 'Ann', 'Artist'],
        ['album', 'y', 'spotify:album:y', 'Album y', 'Ann'],
      ]);
      expect(shelf?.items[1]?.image).toEqual({ url: 'http://pl/p1' });
      expect(shelf?.items[2]?.image).toBeUndefined();
      // The title came from the listener's own list, so no per-playlist request.
      expect(calls.some((c) => c.path.startsWith('/playlists/'))).toBe(false);
    });

    it("subtitles a playlist 'Playlist' when it has no owner name, and skips an artist missing from the track", async () => {
      const { shelf } = await shelfOf(
        {
          ...homeBase(),
          '/me/player/recently-played': paging([
            play(track('1'), 'spotify:playlist:p1'),
            play(track('2'), 'spotify:artist:gone'),
          ]),
          '/me/playlists': paging([{ ...plRaw('p1'), owner: undefined }]),
        },
        'jump-back-in',
      );
      expect(shelf?.items.map((i) => [i.id, i.subtitle])).toEqual([['p1', 'Playlist']]);
    });

    it('de-duplicates by uri, keeping the first sighting', async () => {
      const { shelf } = await shelfOf(
        {
          ...homeBase(),
          '/me/player/recently-played': paging([
            play(track('1', { album: album('x') })),
            play(track('2'), 'spotify:playlist:p1'),
            play(track('3', { album: album('x') }), 'spotify:album:x'),
            play(track('4'), 'spotify:playlist:p1'),
            play(null, 'spotify:playlist:p1'),
          ]),
          '/me/playlists': paging([plRaw('p1')]),
        },
        'jump-back-in',
      );
      expect(shelf?.items.map((i) => i.id)).toEqual(['x', 'p1']);
    });

    it('caps at 12', async () => {
      const { shelf } = await shelfOf(
        {
          ...homeBase(),
          '/me/player/recently-played': paging(
            Array.from({ length: 15 }, (_, i) => play(track(`t${i}`, { album: album(`al${i}`) }))),
          ),
        },
        'jump-back-in',
      );
      expect(shelf?.items.map((i) => i.id)).toEqual(Array.from({ length: 12 }, (_, i) => `al${i}`));
    });

    it('looks up at most 6 playlists that are not in the listener list', async () => {
      const ids = Array.from({ length: 8 }, (_, i) => `u${i}`);
      const { shelf, calls } = await shelfOf(
        {
          ...homeBase(),
          '/me/player/recently-played': paging(ids.map((id) => play(track(id), `spotify:playlist:${id}`))),
          ...Object.fromEntries(ids.map(unknownPlaylist)),
        },
        'jump-back-in',
      );
      expect(calls.filter((c) => c.path.startsWith('/playlists/')).map((c) => c.path)).toEqual(
        ids.slice(0, 6).map((id) => `/playlists/${id}`),
      );
      expect(shelf?.items.map((i) => i.id)).toEqual(ids.slice(0, 6));
      expect(shelf?.items[0]).toMatchObject({ title: 'Playlist u0', subtitle: 'Owner z' });
    });

    it('skips a playlist whose lookup fails without failing the shelf', async () => {
      const { shelf } = await shelfOf(
        {
          ...homeBase(),
          '/me/player/recently-played': paging([
            play(track('1'), 'spotify:playlist:bad'),
            play(track('2'), 'spotify:playlist:ok'),
            play(track('3', { album: album('x') })),
          ]),
          '/playlists/bad': () => {
            throw new SpotifyError(500);
          },
          ...Object.fromEntries([unknownPlaylist('ok')]),
        },
        'jump-back-in',
      );
      expect(shelf?.items.map((i) => i.id)).toEqual(['ok', 'x']);
    });

    it('shares one /me/playlists fetch with the other shelves', async () => {
      const { calls } = await shelfOf(
        {
          ...homeBase(),
          '/me/player/recently-played': paging([play(track('1'), 'spotify:playlist:p1')]),
          '/me/playlists': paging([plRaw('p1')]),
        },
        'jump-back-in',
      );
      expect(calls.filter((c) => c.path === '/me/playlists')).toHaveLength(1);
      expect(calls.filter((c) => c.path === '/me/player/recently-played')).toHaveLength(1);
    });
  });

  describe('made for you and playlists', () => {
    const mine = paging([plRaw('p1'), plRaw('s1', 'spotify'), plRaw('p2', 'v'), plRaw('s2', 'spotify')]);

    it('made-for-you holds only playlists owned by spotify, and playlists leaves them out', async () => {
      const { shelves } = await shelfOf({ ...homeBase(), '/me/playlists': mine }, 'x');
      const made = shelves.find((s) => s.id === 'made-for-you');
      expect(made?.items.map((i) => [i.kind, i.id, i.subtitle])).toEqual([
        ['playlist', 's1', 'Made for you by Spotify'],
        ['playlist', 's2', 'Made for you by Spotify'],
      ]);
      expect(shelves.find((s) => s.id === 'playlists')?.items.map((i) => i.id)).toEqual(['p1', 'p2']);
    });

    it('omits made-for-you when the listener has none', async () => {
      const { shelves } = await shelfOf({ ...homeBase(), '/me/playlists': paging([plRaw('p1')]) }, 'x');
      expect(shelves.map((s) => s.id)).toEqual(['playlists']);
    });

    it('follows next for up to 4 pages of 50', async () => {
      const { shelves, calls } = await shelfOf(
        {
          ...homeBase(),
          '/me/playlists': (c: Call) => {
            const offset = Number(c.params?.offset ?? 0);
            return paging([plRaw(`s${offset}`, 'spotify')], 'https://more');
          },
        },
        'x',
      );
      const reqs = calls.filter((c) => c.path === '/me/playlists');
      expect(reqs.map((c) => [c.params?.limit, c.params?.offset])).toEqual([[50, 0], [50, 50], [50, 100], [50, 150]]);
      expect(shelves.find((s) => s.id === 'made-for-you')?.items).toHaveLength(4);
    });
  });

  describe('top mixes', () => {
    it('builds the three fixed mixes from the three time ranges', async () => {
      const { shelf, calls } = await shelfOf(
        {
          ...homeBase(),
          '/me/top/tracks': ranges({
            short: [track('s1', { album: album('as', { images: [{ url: 'http://s' }] }) })],
            medium: [track('m1', { album: album('am', { images: [{ url: 'http://m' }] }) })],
            long: [track('l1')],
          }),
        },
        'top-mixes',
      );
      expect(shelf?.title).toBe('Your Top Mixes');
      expect(shelf?.items).toEqual([
        { kind: 'mix', id: 'on-repeat', uri: 'mango:mix:on-repeat', title: 'On Repeat', subtitle: 'What you play most right now', image: { url: 'http://s' } },
        { kind: 'mix', id: 'top-songs', uri: 'mango:mix:top-songs', title: 'Your Top Songs', subtitle: 'Your favourites of the last six months', image: { url: 'http://m' } },
        { kind: 'mix', id: 'all-time', uri: 'mango:mix:all-time', title: 'All-Time Favourites', subtitle: 'The songs you always come back to', image: { url: 'http://img/alb' } },
      ]);
      const reqs = calls.filter((c) => c.path === '/me/top/tracks').map((c) => [c.params?.time_range, c.params?.limit]);
      expect(reqs).toEqual([['short_term', 50], ['medium_term', 50], ['long_term', 50]]);
    });

    it('gives an artist with 6 tracks a mix but not one with 5', async () => {
      const { shelf } = await shelfOf(
        { ...homeBase(), '/me/top/tracks': ranges({ medium: [...by('x', 6), ...by('y', 5)] }) },
        'top-mixes',
      );
      expect(shelf?.items.map((i) => i.id)).toEqual(['top-songs', 'artist:x']);
      expect(shelf?.items[1]).toMatchObject({
        kind: 'mix', uri: 'mango:mix:artist:x', title: 'Name x Mix', subtitle: 'Built from what you play',
      });
    });

    it('counts a track once across ranges, and for every credited artist', async () => {
      const dup = by('x', 5);
      const duet = Array.from({ length: 6 }, (_, i) =>
        track(`d${i}`, { artists: [{ id: 'p', name: 'Pia' }, { id: 'q', name: 'Quin' }] }),
      );
      const { shelf } = await shelfOf(
        { ...homeBase(), '/me/top/tracks': ranges({ short: dup, medium: [...dup, ...duet], long: dup }) },
        'top-mixes',
      );
      expect(shelf?.items.map((i) => i.id).filter((id) => id.startsWith('artist:'))).toEqual(['artist:p', 'artist:q']);
    });

    it('keeps at most 4 artist mixes, most tracks first', async () => {
      const lists = ['a', 'b', 'c', 'd', 'e', 'f'].flatMap((id, i) => by(id, 6 + i));
      const { shelf } = await shelfOf({ ...homeBase(), '/me/top/tracks': ranges({ medium: lists }) }, 'top-mixes');
      expect(shelf?.items.map((i) => i.id)).toEqual(['top-songs', 'artist:f', 'artist:e', 'artist:d', 'artist:c']);
    });

    it('leaves out a range that failed, and the shelf when all three fail', async () => {
      const { shelf } = await shelfOf({ ...homeBase(), '/me/top/tracks': ranges({ long: [track('1')] }) }, 'top-mixes');
      expect(shelf?.items.map((i) => i.id)).toEqual(['all-time']);
      const none = await shelfOf({ ...homeBase(), '/me/top/tracks': ranges({}) }, 'top-mixes');
      expect(none.shelf).toBeUndefined();
    });

    it('drops local and unplayable-as-null tracks before building', async () => {
      const { shelf } = await shelfOf(
        { ...homeBase(), '/me/top/tracks': ranges({ short: [track('1', { id: null, is_local: true }), null] }) },
        'top-mixes',
      );
      expect(shelf).toBeUndefined();
    });
  });

  describe('recent', () => {
    it('lists tracks newest first, de-duplicated by track uri, with artist names and album art', async () => {
      const { shelf } = await shelfOf(
        {
          ...homeBase(),
          '/me/player/recently-played': paging([
            play(track('1', { artists: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo' }] })),
            play(track('2')),
            play(track('1')),
            play(null),
            play(track('3', { type: 'episode' })),
            play(track('4', { id: null })),
          ]),
        },
        'recent',
      );
      expect(shelf?.items.map((i) => [i.kind, i.id, i.uri])).toEqual([
        ['track', '1', 'spotify:track:1'],
        ['track', '2', 'spotify:track:2'],
      ]);
      expect(shelf?.items[0]).toMatchObject({ subtitle: 'Ann, Bo', image: { url: 'http://img/alb' } });
    });

    it('caps at 20', async () => {
      const { shelf } = await shelfOf(
        {
          ...homeBase(),
          '/me/player/recently-played': paging(Array.from({ length: 30 }, (_, i) => play(track(`t${i}`)))),
        },
        'recent',
      );
      expect(shelf?.items).toHaveLength(20);
      expect(shelf?.items[19]?.id).toBe('t19');
    });
  });

  it('builds favourite artists from medium_term top artists', async () => {
    const { shelf, calls } = await shelfOf({ ...homeBase(), '/me/top/artists': paging([artist('9')]) }, 'favourite-artists');
    expect(shelf?.items).toMatchObject([{ kind: 'artist', id: '9', subtitle: 'Artist' }]);
    expect(calls.find((c) => c.path === '/me/top/artists')?.params).toMatchObject({ time_range: 'medium_term', limit: 20 });
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
      const shelf = shelves.find((s) => s.id === 'new-releases');
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
      expect(cached.find((s) => s.id === 'new-releases')?.items.length).toBe(20);

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
      expect(shelves.some((s) => s.id === 'new-releases')).toBe(true);
    });

    it('keeps the shelf when one artist request fails', async () => {
      const { client } = fakeClient(
        routes({
          '/artists/ar0/albums': () => {
            throw new SpotifyError(500);
          },
        }),
      );
      const shelf = (await createSpotifySource({ client, storage }).home()).find((s) => s.id === 'new-releases');
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

  it('playlist 404 for one in the listener library resolves with tracks withheld', async () => {
    const { client, calls } = fakeClient({
      '/me/playlists': paging([plRaw('mix1', 'spotify', { description: 'Fresh' }), plRaw('p2')]),
    });
    const src = createSpotifySource({ client, storage });
    const d = await src.playlist('mix1');
    expect(d).toMatchObject({ id: 'mix1', uri: 'spotify:playlist:mix1', name: 'Playlist mix1', description: 'Fresh', ownerName: 'Spotify', tracks: null });
    // The library list was fetched once, only because nothing had been seen yet.
    await src.playlist('p2');
    expect(calls.filter((c) => c.path === '/me/playlists')).toHaveLength(1);
  });

  it('playlist 404 uses playlists already seen on Home without fetching again', async () => {
    const { client, calls } = fakeClient({
      ...homeBase(),
      '/me/playlists': paging([plRaw('mix1', 'spotify')]),
    });
    const src = createSpotifySource({ client, storage });
    await src.home();
    const before = calls.filter((c) => c.path === '/me/playlists').length;
    expect((await src.playlist('mix1')).tracks).toBeNull();
    expect(calls.filter((c) => c.path === '/me/playlists')).toHaveLength(before);
  });

  it('playlist 404 for an id not in the library is still NotFoundError', async () => {
    const { client } = fakeClient({ '/me/playlists': paging([plRaw('p1')]) });
    await expect(createSpotifySource({ client, storage }).playlist('other')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('playlist 404 is NotFoundError when the library list cannot be fetched either', async () => {
    const { client } = fakeClient({
      '/me/playlists': () => {
        throw new SpotifyError(500);
      },
    });
    await expect(createSpotifySource({ client, storage }).playlist('x')).rejects.toBeInstanceOf(NotFoundError);
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

describe('mix()', () => {
  const src = (routes: Record<string, Route>) => {
    const { client, calls } = fakeClient(routes);
    return { source: createSpotifySource({ client, storage }), calls };
  };

  it.each([
    ['on-repeat', 'short_term', 'On Repeat', 'What you play most right now'],
    ['top-songs', 'medium_term', 'Your Top Songs', 'Your favourites of the last six months'],
    ['all-time', 'long_term', 'All-Time Favourites', 'The songs you always come back to'],
  ])('%s loads %s only and carries its title and description', async (id, range, title, description) => {
    const { source, calls } = src({
      '/me/top/tracks': ranges({ short: [track('s')], medium: [track('m')], long: [track('l'), track('x', { id: null })] }),
    });
    const mix = await source.mix(id);
    const want = { short_term: ['s'], medium_term: ['m'], long_term: ['l'] }[range as 'short_term'];
    expect(mix).toMatchObject({ id, title, description });
    expect(mix.tracks.map((t) => t.id)).toEqual(want);
    expect(mix.image).toEqual({ url: 'http://img/alb' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toMatchObject({ time_range: range, limit: 50 });
  });

  it('an artist mix holds that artist\'s tracks from the union of the ranges, without duplicates', async () => {
    const a = by('x', 3);
    const { source } = src({
      '/me/top/tracks': ranges({ short: [...a, track('other')], medium: [...a, ...by('x', 2, 3)], long: by('y', 1) }),
    });
    const mix = await source.mix('artist:x');
    expect(mix).toMatchObject({ id: 'artist:x', title: 'Name x Mix', description: 'Built from what you play' });
    expect(mix.tracks.map((t) => t.id)).toEqual(['x0', 'x1', 'x2', 'x3', 'x4']);
  });

  it('rejects NotFoundError for an unknown id and for an artist with no tracks', async () => {
    const { source, calls } = src({ '/me/top/tracks': ranges({ short: [track('1')], medium: [], long: [] }) });
    await expect(source.mix('nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(calls).toHaveLength(0);
    await expect(source.mix('artist:nobody')).rejects.toBeInstanceOf(NotFoundError);
    await expect(source.mix('top-songs')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when its range fails, so the screen can show an error', async () => {
    const { source } = src({ '/me/top/tracks': ranges({ medium: [track('m')] }) });
    await expect(source.mix('on-repeat')).rejects.toBeInstanceOf(SpotifyError);
    await expect(source.mix('top-songs')).resolves.toMatchObject({ id: 'top-songs' });
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
