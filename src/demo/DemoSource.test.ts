import { describe, expect, it } from 'vitest';
import { NotFoundError, SHELVES, type ShelfId } from '../domain/types';
import { createDemoLibrary, resolveTracks } from './library';
import { createDemoSource } from './DemoSource';

const lib = createDemoLibrary();

describe('createDemoLibrary', () => {
  it('is deterministic', () => {
    expect(createDemoLibrary()).toEqual(createDemoLibrary());
  });
  it('is big enough, with unique ids and resolvable albums', () => {
    expect(lib.albums.length).toBeGreaterThanOrEqual(24);
    expect(lib.artists.length).toBeGreaterThanOrEqual(12);
    expect(lib.playlists.length).toBeGreaterThanOrEqual(8);
    const uris = [...lib.albums, ...lib.artists, ...lib.playlists.map((p) => p.playlist), ...lib.tracks].map((x) => x.uri);
    expect(new Set(uris).size).toBe(uris.length);
    const albumIds = new Set(lib.albums.map((a) => a.id));
    for (const t of lib.tracks) expect(albumIds.has(t.album.id)).toBe(true);
  });
  it('has varied tracks and album types', () => {
    for (const a of lib.albums) expect(a.tracks.length).toBeGreaterThanOrEqual(8);
    for (const t of lib.tracks) {
      expect(t.durationMs).toBeGreaterThanOrEqual(120_000);
      expect(t.durationMs).toBeLessThanOrEqual(300_000);
    }
    expect(lib.tracks.some((t) => t.explicit)).toBe(true);
    expect(new Set(lib.albums.map((a) => a.albumType))).toEqual(new Set(['album', 'single']));
  });
  it('resolves mix uris to the mix tracks', () => {
    const mix = lib.mixes[0]!;
    expect(resolveTracks(lib, `mango:mix:${mix.id}`)).toEqual(mix.tracks);
  });
  it('resolves uris to tracks', () => {
    const a = lib.albums[0]!;
    expect(resolveTracks(lib, a.uri)).toEqual(a.tracks);
    expect(resolveTracks(lib, a.tracks[0]!.uri)).toEqual([a.tracks[0]]);
    expect(resolveTracks(lib, lib.artists[0]!.uri).length).toBeGreaterThan(0);
    expect(resolveTracks(lib, lib.playlists[0]!.playlist.uri).length).toBeGreaterThan(0);
    expect(resolveTracks(lib, 'nope')).toEqual([]);
  });
});

describe('createDemoSource', () => {
  const src = createDemoSource(lib);

  it('home returns all seven shelves in SHELVES order with their titles', async () => {
    const shelves = await src.home();
    const ids = Object.keys(SHELVES) as ShelfId[];
    expect(shelves.map((s) => s.id)).toEqual(ids);
    expect(shelves.map((s) => s.title)).toEqual(ids.map((id) => SHELVES[id]));
    for (const s of shelves) expect(s.items.length).toBeGreaterThan(0);
  });

  it('uses the item kinds and uri forms of the real source', async () => {
    const byId = Object.fromEntries((await src.home()).map((s) => [s.id, s.items]));
    expect(byId['recent']!.every((i) => i.kind === 'track')).toBe(true);
    expect(byId['top-mixes']!.every((i) => i.kind === 'mix' && i.uri === `mango:mix:${i.id}`)).toBe(true);
    expect(byId['top-mixes']!.map((i) => i.id).slice(0, 3)).toEqual(['on-repeat', 'top-songs', 'all-time']);
    expect(byId['top-mixes']!.length).toBe(5);
    expect(byId['favourite-artists']!.every((i) => i.kind === 'artist')).toBe(true);
    expect(byId['new-releases']!.every((i) => i.kind === 'album')).toBe(true);
    const kinds = new Set(byId['jump-back-in']!.map((i) => i.kind));
    expect(kinds.has('album') && kinds.has('playlist')).toBe(true);
  });

  it('made-for-you holds only the Spotify-made playlists, which are absent from playlists and have no tracks', async () => {
    const shelves = await src.home();
    const made = shelves.find((s) => s.id === 'made-for-you')!;
    const mine = shelves.find((s) => s.id === 'playlists')!;
    expect(made.items.length).toBeGreaterThanOrEqual(3);
    const spotifyOwned = lib.playlists.filter((p) => p.playlist.ownerName === 'Spotify' && !p.owned);
    expect(made.items.map((i) => i.id)).toEqual(spotifyOwned.map((p) => p.playlist.id));
    expect(made.items.every((i) => i.kind === 'playlist' && i.subtitle === 'Made for you by Spotify')).toBe(true);
    for (const i of made.items) {
      expect(mine.items.map((x) => x.id)).not.toContain(i.id);
      expect((await src.playlist(i.id)).tracks).toBeNull();
    }
    expect(mine.items.map((i) => i.title)).toContain('Studio Collective Picks');
  });

  it('mix() works for every item on top-mixes and rejects unknown ids', async () => {
    const shelf = (await src.home()).find((s) => s.id === 'top-mixes')!;
    for (const item of shelf.items) {
      const mix = await src.mix(item.id);
      expect(mix).toMatchObject({ id: item.id, title: item.title });
      expect(mix.tracks.length).toBeGreaterThan(0);
    }
    for (const id of ['on-repeat', 'top-songs', 'all-time']) {
      const n = (await src.mix(id)).tracks.length;
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(40);
    }
    await expect(src.mix('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is deterministic across home() calls', async () => {
    expect(await src.home()).toEqual(await src.home());
  });

  it('playlists: owned has tracks, foreign is null', async () => {
    const own = lib.playlists.find((p) => p.owned)!;
    const foreign = lib.playlists.find((p) => !p.owned && p.playlist.ownerName !== 'Spotify')!;
    expect((await src.playlist(own.playlist.id)).tracks).toBeInstanceOf(Array);
    expect((await src.playlist(foreign.playlist.id)).tracks).toBeNull();
  });

  it('pages library lists at 20 with a cursor', async () => {
    const p1 = await src.library('albums');
    expect(p1.items.length).toBeLessThanOrEqual(20);
    expect(p1.next).toEqual(expect.any(String));
    const p2 = await src.library('albums', p1.next!);
    expect(p2.items[0]!.id).not.toBe(p1.items[0]!.id);
    const songs = await src.librarySongs();
    expect(songs.items.length).toBe(20);
    expect(songs.next).not.toBeNull();
  });

  it('search groups, case-insensitivity and paging', async () => {
    const empty = await src.search('');
    for (const g of [empty.tracks, empty.artists, empty.albums, empty.playlists]) {
      expect(g).toEqual({ items: [], next: null });
    }
    const artist = lib.artists[0]!;
    const hit = await src.search(artist.name.toUpperCase());
    expect(hit.artists.items.map((i) => i.id)).toContain(artist.id);
    const r = await src.search('a');
    expect(r.albums.items.length).toBeLessThanOrEqual(10);
    expect(r.tracks.items.length).toBeLessThanOrEqual(10);
    expect(r.tracks.next).not.toBeNull();
    const more = await src.search('a', 'track', r.tracks.next!);
    expect(more.tracks.items.length).toBeGreaterThan(0);
    expect(more.tracks.items[0]!.id).not.toBe(r.tracks.items[0]!.id);
    expect(more.albums).toEqual({ items: [], next: null });
  });

  it('saves and unsaves', async () => {
    const s = createDemoSource(lib);
    const uri = lib.albums.at(-1)!.uri;
    await s.setSaved([uri], false);
    expect(await s.isSaved([uri])).toEqual([false]);
    await s.setSaved([uri], true);
    expect(await s.isSaved([uri, 'nope'])).toEqual([true, false]);
  });

  it('splits artist albums and singles; rejects unknown ids', async () => {
    const { artist, albums, singles } = await src.artist(lib.artists[0]!.id);
    expect(artist.name).toBe(lib.artists[0]!.name);
    expect(albums.length + singles.length).toBeGreaterThan(0);
    await expect(src.album('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(src.playlist('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(src.artist('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('me and recentlyAdded work', async () => {
    expect((await src.me()).name).toEqual(expect.any(String));
    expect((await src.recentlyAdded()).length).toBeGreaterThan(0);
  });

  it('reports how many songs are liked in total', async () => {
    const src = createDemoSource();
    const first = await src.librarySongs();
    let count = first.items.length;
    for (let next = first.next; next; ) {
      const page = await src.librarySongs(next);
      count += page.items.length;
      next = page.next;
    }
    expect(first.total).toBe(count);
    expect(first.total).toBeGreaterThan(first.items.length);
  });
});
