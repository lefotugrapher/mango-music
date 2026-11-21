import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../domain/types';
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

  it('home returns the five shelves in order', async () => {
    const shelves = await src.home();
    expect(shelves.map((s) => s.id)).toEqual(['recent', 'top-picks', 'heavy-rotation', 'new-from-artists', 'playlists']);
    expect(shelves.map((s) => s.title)).toEqual([
      'Recently Played', 'Top Picks', 'Heavy Rotation', 'New From Your Artists', 'Your Playlists',
    ]);
    for (const s of shelves) expect(s.items.length).toBeGreaterThan(0);
  });

  it('playlists: owned has tracks, foreign is null', async () => {
    const own = lib.playlists.find((p) => p.owned)!;
    const foreign = lib.playlists.find((p) => !p.owned)!;
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
