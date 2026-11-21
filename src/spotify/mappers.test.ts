import { describe, expect, it } from 'vitest';
import { mixToShelfItem, playlistToShelfItem, sdkTrackToTrack, toAlbum, toAlbumRef, toArtist, toPlaylist, toShelfItem, toTrack } from './mappers';
import type { RawAlbum, RawArtist, RawPlaylist, RawTrack, WebPlaybackTrack } from './raw';

const rawAlbum: RawAlbum = {
  id: 'al1',
  uri: 'spotify:album:al1',
  name: 'Album One',
  album_type: 'single',
  release_date: '2024-05-01',
  images: [{ url: 'http://img/1', width: 640, height: 640 }],
  artists: [{ id: 'ar1', name: 'Ann' }, { id: 'ar2', name: 'Bo' }],
};
const rawTrack: RawTrack = {
  id: 't1',
  uri: 'spotify:track:t1',
  name: 'Song',
  type: 'track',
  duration_ms: 1234,
  explicit: true,
  artists: [{ id: 'ar1', name: 'Ann' }],
  album: rawAlbum,
};

describe('toTrack', () => {
  it('maps a normal track', () => {
    expect(toTrack(rawTrack)).toEqual({
      id: 't1',
      uri: 'spotify:track:t1',
      name: 'Song',
      artists: [{ id: 'ar1', name: 'Ann' }],
      album: {
        id: 'al1',
        uri: 'spotify:album:al1',
        name: 'Album One',
        artists: [{ id: 'ar1', name: 'Ann' }, { id: 'ar2', name: 'Bo' }],
        images: [{ url: 'http://img/1', width: 640, height: 640 }],
        releaseDate: '2024-05-01',
        albumType: 'single',
      },
      durationMs: 1234,
      explicit: true,
      playable: true,
    });
  });

  it('drops null, local files and episodes', () => {
    expect(toTrack(null)).toBeNull();
    expect(toTrack(undefined)).toBeNull();
    expect(toTrack({ ...rawTrack, id: null, is_local: true })).toBeNull();
    expect(toTrack({ ...rawTrack, type: 'episode' })).toBeNull();
  });

  it('marks is_playable === false as unplayable', () => {
    expect(toTrack({ ...rawTrack, is_playable: false })?.playable).toBe(false);
  });

  it('tolerates missing and null images', () => {
    const { images: _drop, ...noImages } = rawAlbum;
    expect(toTrack({ ...rawTrack, album: noImages })?.album.images).toEqual([]);
    expect(toTrack({ ...rawTrack, album: { ...rawAlbum, images: null } })?.album.images).toEqual([]);
  });

  it('uses the album passed in for simplified tracks', () => {
    const { album: _drop, ...simplified } = rawTrack;
    const ref = toAlbumRef(rawAlbum);
    expect(toTrack(simplified, ref)?.album).toBe(ref);
  });
});

describe('album, artist, playlist', () => {
  it('toAlbumRef ignores unknown album types', () => {
    expect(toAlbumRef({ ...rawAlbum, album_type: 'weird' }).albumType).toBeUndefined();
  });

  it('toAlbum carries label, copyright and external url', () => {
    const a = toAlbum(
      { ...rawAlbum, label: 'Lbl', copyrights: [{ text: '(C) Ann', type: 'C' }], external_urls: { spotify: 'http://open/al1' } },
      [],
    );
    expect(a).toMatchObject({ id: 'al1', label: 'Lbl', copyright: '(C) Ann', externalUrl: 'http://open/al1', tracks: [] });
  });

  it('toArtist and toPlaylist fill defaults for nulls', () => {
    const artist: RawArtist = { id: 'ar1', uri: 'spotify:artist:ar1', name: 'Ann', images: null };
    expect(toArtist(artist)).toEqual({ id: 'ar1', uri: 'spotify:artist:ar1', name: 'Ann', images: [], externalUrl: '' });
    const pl: RawPlaylist = {
      id: 'p1', uri: 'spotify:playlist:p1', name: 'Mix', description: null, images: null,
      owner: { id: 'u1', display_name: null }, external_urls: { spotify: 'http://open/p1' },
    };
    expect(toPlaylist(pl)).toEqual({
      id: 'p1', uri: 'spotify:playlist:p1', name: 'Mix', description: '', images: [], ownerName: 'u1', externalUrl: 'http://open/p1',
    });
  });
});

describe('toShelfItem subtitles', () => {
  it('album: artist names joined', () => {
    expect(toShelfItem(rawAlbum, 'album')).toEqual({
      kind: 'album', id: 'al1', uri: 'spotify:album:al1', title: 'Album One', subtitle: 'Ann, Bo',
      image: { url: 'http://img/1', width: 640, height: 640 },
    });
  });
  it('artist: "Artist", no image when none', () => {
    const s = toShelfItem({ id: 'ar1', uri: 'u', name: 'Ann' }, 'artist');
    expect(s.subtitle).toBe('Artist');
    expect(s.image).toBeUndefined();
  });
  it('playlist: owner name', () => {
    expect(toShelfItem({ id: 'p1', uri: 'u', name: 'Mix', owner: { display_name: 'Kay' } }, 'playlist').subtitle).toBe('Kay');
  });
  it('track: artist names, image from album', () => {
    const s = toShelfItem(rawTrack, 'track');
    expect(s.subtitle).toBe('Ann');
    expect(s.image?.url).toBe('http://img/1');
  });
});

describe('mixToShelfItem', () => {
  it('uses the mango:mix uri, the description as subtitle and the given image', () => {
    const mix = { id: 'artist:ar1', title: 'Ann Mix', description: 'Built from what you play', image: { url: 'http://i' }, tracks: [] };
    expect(mixToShelfItem(mix)).toEqual({
      kind: 'mix', id: 'artist:ar1', uri: 'mango:mix:artist:ar1', title: 'Ann Mix',
      subtitle: 'Built from what you play', image: { url: 'http://i' },
    });
  });
  it('omits image when the mix has none', () => {
    expect(mixToShelfItem({ id: 'x', title: 'X', description: 'd', tracks: [] })).not.toHaveProperty('image');
  });
});

describe('playlistToShelfItem', () => {
  const base = toPlaylist({ id: 'p', uri: 'spotify:playlist:p', name: 'P', images: [{ url: 'http://i' }], owner: { id: 'u', display_name: 'Una' } });
  it('defaults the subtitle to the owner name, then to Playlist', () => {
    expect(playlistToShelfItem(base)).toEqual({
      kind: 'playlist', id: 'p', uri: 'spotify:playlist:p', title: 'P', subtitle: 'Una', image: { url: 'http://i' },
    });
    expect(playlistToShelfItem({ ...base, ownerName: '' }).subtitle).toBe('Playlist');
  });
  it('takes an explicit subtitle', () => {
    expect(playlistToShelfItem(base, 'Made for you by Spotify').subtitle).toBe('Made for you by Spotify');
  });
});

describe('sdkTrackToTrack', () => {
  const sdk: WebPlaybackTrack = {
    uri: 'spotify:track:t9',
    id: null,
    type: 'track',
    name: 'Live',
    is_playable: true,
    album: { uri: 'spotify:album:al9', name: 'Al', images: [{ url: 'http://img/9' }] },
    artists: [{ uri: 'spotify:artist:ar9', name: 'Zed' }],
  };
  it('derives ids from uris and uses the fallback duration', () => {
    const t = sdkTrackToTrack(sdk, 5000);
    expect(t.id).toBe('t9');
    expect(t.album).toMatchObject({ id: 'al9', name: 'Al', images: [{ url: 'http://img/9' }] });
    expect(t.artists).toEqual([{ id: 'ar9', name: 'Zed' }]);
    expect(t.durationMs).toBe(5000);
  });
  it('prefers the track own duration and defaults to 0', () => {
    expect(sdkTrackToTrack({ ...sdk, duration_ms: 100 }, 5000).durationMs).toBe(100);
    expect(sdkTrackToTrack(sdk).durationMs).toBe(0);
  });
});
