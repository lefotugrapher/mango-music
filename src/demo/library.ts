import type { Album, AlbumRef, Artist, ArtistRef, Image, Mix, Playlist, Track } from '../domain/types';
import { demoArtwork, mulberry32 } from './artwork';

export type DemoPlaylist = { playlist: Playlist; tracks: Track[]; owned: boolean };
export type DemoLibrary = {
  artists: Artist[];
  albums: Album[];
  playlists: DemoPlaylist[];
  /** Mixes for the 'top-mixes' shelf; uri form is `mango:mix:<id>`. */
  mixes: Mix[];
  /** Every track, album by album. */
  tracks: Track[];
};

const URL = 'https://open.spotify.com/';

const ARTIST_NAMES = [
  'Marlowe Finch', 'The Lantern Hours', 'Odessa Quill', 'Hollow Pines', 'Juno Ramsgate',
  'Static Orchard', 'Calder & Vane', 'Mira Solenne', 'Northern Kites', 'Teodor Blythe',
  'Paper Tigers Club', 'Saffron Delaney', 'Low Tide Choir', 'Wren Alderidge', 'Atlas Moth',
];

const ALBUM_NAMES = [
  'Glasshouse Weather', 'Slow Fires', 'Paper Constellations', 'Night Bus Home', 'Salt and Static',
  'The Long Thaw', 'Tangerine Hours', 'Mirrors at Dusk', 'Soft Machinery', 'Harbour Lights',
  'A Map of Small Rooms', 'Violet Hush', 'Borrowed Summers', 'Wildflower Circuit', 'Quiet Engines',
  'Afterglow Avenue', 'Echoes in Amber', 'Rooftop Almanac', 'Fever Dream Diner', 'Moth Season',
  'Cold Brew Sundays', 'Velvet Cartography', 'Low Orbit', 'The Garden Variety', 'Neon Orchard',
  'Winter Postcards', 'Driftwood Radio', 'Copper Skyline',
];

const W1 = [
  'Midnight', 'Paper', 'Golden', 'Hollow', 'Electric', 'Velvet', 'Faded', 'Silver', 'Restless', 'Gentle',
  'Burning', 'Distant', 'Crooked', 'Neon', 'Quiet', 'Wild', 'Lucky', 'Broken', 'Sunday', 'Amber',
];
const W2 = [
  'Highway', 'Lanterns', 'Weather', 'Rivers', 'Honey', 'Satellites', 'Garden', 'Summer', 'Static', 'Kites',
  'Thunder', 'Mirrors', 'Orchard', 'Daydream', 'Harbour', 'Letters', 'Fever', 'Shadows', 'Carousel', 'Ember',
];
const FORMS: ((a: string, b: string) => string)[] = [
  (a, b) => `${a} ${b}`,
  (a, b) => `${b} in the ${a} Light`,
  (a, b) => `No ${b} Without ${a}`,
  (a, b) => `${a} ${b} (Reprise)`,
  (a, b) => `Dancing with ${b}`,
  (a, b) => `The ${a} ${b}`,
];

const LABELS = ['Fernhill Records', 'Quarry Lane Music', 'Open Field Co.', 'Tidewater Sound'];
const DESCRIPTIONS = [
  'Slow mornings and warm coffee.',
  'Songs for the long way home.',
  'Turn it up and open a window.',
  'Quiet focus for late nights.',
  'A weekend in twelve songs.',
  'Easy rhythms, no skips.',
  'For rainy afternoons.',
  'Road trip essentials, invented.',
];
const PLAYLIST_NAMES = [
  'Morning Static', 'Late Night Drive', 'Focus Garden', 'Sunday Slow Down',
  'Rainy Window', 'Weekend Warmup', 'Paper Planes', 'Studio Collective Picks',
];
/** Invented names on purpose: these stand in for Spotify-made playlists. */
const SPOTIFY_PLAYLIST_NAMES = ['Monday Discoveries', 'Friday Arrivals', 'Daily Blend 1', 'Daily Blend 2'];

const image = (seed: string): Image => ({ url: demoArtwork(seed), width: 600, height: 600 });

export function createDemoLibrary(): DemoLibrary {
  const rnd = mulberry32(20261121);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const shuffled = <T,>(xs: T[]): T[] => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };

  const artists: Artist[] = ARTIST_NAMES.map((name, i) => {
    const id = `ar${String(i + 1).padStart(2, '0')}`;
    return { id, uri: `demo:artist:${id}`, name, images: [image(`artist:${id}`)], externalUrl: URL };
  });
  const ref = (a: Artist): ArtistRef => ({ id: a.id, name: a.name });

  const usedTitles = new Set<string>();
  const trackTitle = () => {
    for (;;) {
      const t = FORMS[int(0, FORMS.length - 1)]!(W1[int(0, W1.length - 1)]!, W2[int(0, W2.length - 1)]!);
      if (!usedTitles.has(t)) {
        usedTitles.add(t);
        return t;
      }
    }
  };

  const tracks: Track[] = [];
  const albums: Album[] = ALBUM_NAMES.map((name, i) => {
    const id = `al${String(i + 1).padStart(2, '0')}`;
    const primary = artists[i % artists.length]!;
    const guest = i % 4 === 1 ? artists[(i + 5) % artists.length]! : null;
    const albumType = i % 5 === 3 ? 'single' : 'album';
    // Spread over 2022-2026, newest last in the list so recency varies by album.
    const year = 2022 + Math.floor((i * 5) / ALBUM_NAMES.length);
    const releaseDate = `${year}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
    const albumRef: AlbumRef = {
      id,
      uri: `demo:album:${id}`,
      name,
      artists: [ref(primary)],
      images: [image(`album:${id}`)],
      releaseDate,
      albumType,
    };
    const albumTracks: Track[] = Array.from({ length: int(8, 12) }, (_, n) => {
      const tid = `${id}t${String(n + 1).padStart(2, '0')}`;
      return {
        id: tid,
        uri: `demo:track:${tid}`,
        name: trackTitle(),
        artists: guest && n % 3 === 2 ? [ref(primary), ref(guest)] : [ref(primary)],
        album: albumRef,
        durationMs: int(120, 299) * 1000 + int(0, 999),
        explicit: rnd() < 0.12,
        playable: true,
      };
    });
    tracks.push(...albumTracks);
    return {
      ...albumRef,
      tracks: albumTracks,
      label: LABELS[i % LABELS.length],
      copyright: `(C) ${year} ${LABELS[i % LABELS.length]}`,
      externalUrl: URL,
    };
  });

  const makePlaylist = (name: string, i: number, owned: boolean, ownerName: string): DemoPlaylist => {
    const id = `pl${String(i + 1).padStart(2, '0')}`;
    return {
      owned,
      tracks: shuffled(tracks).slice(0, int(14, 26)),
      playlist: {
        id,
        uri: `demo:playlist:${id}`,
        name,
        description: DESCRIPTIONS[i % DESCRIPTIONS.length]!,
        images: [image(`playlist:${id}`)],
        ownerName,
        externalUrl: URL,
      },
    };
  };
  const playlists: DemoPlaylist[] = [
    ...PLAYLIST_NAMES.map((name, i) =>
      makePlaylist(name, i, i !== PLAYLIST_NAMES.length - 1, i !== PLAYLIST_NAMES.length - 1 ? 'You' : 'Studio Collective'),
    ),
    ...SPOTIFY_PLAYLIST_NAMES.map((name, i) => makePlaylist(name, PLAYLIST_NAMES.length + i, false, 'Spotify')),
  ];

  const makeMix = (id: string, title: string, description: string, picked: Track[]): Mix => ({
    id,
    title,
    description,
    image: picked[0]?.album.images[0],
    tracks: picked,
  });
  const mixes: Mix[] = [
    makeMix('on-repeat', 'On Repeat', 'What you play most right now', shuffled(tracks).slice(0, int(20, 40))),
    makeMix('top-songs', 'Your Top Songs', 'Your favourites of the last six months', shuffled(tracks).slice(0, int(20, 40))),
    makeMix('all-time', 'All-Time Favourites', 'The songs you always come back to', shuffled(tracks).slice(0, int(20, 40))),
    ...artists.slice(0, 2).map((a) =>
      makeMix(
        `artist:${a.id}`,
        `${a.name} Mix`,
        'Built from what you play',
        tracks.filter((t) => t.artists[0]?.id === a.id).slice(0, 30),
      ),
    ),
  ];

  return { artists, albums, playlists, mixes, tracks };
}

export function resolveTracks(lib: DemoLibrary, uri: string): Track[] {
  const album = lib.albums.find((a) => a.uri === uri);
  if (album) return album.tracks;
  const mix = lib.mixes.find((m) => uri === `mango:mix:${m.id}`);
  if (mix) return mix.tracks;
  const playlist = lib.playlists.find((p) => p.playlist.uri === uri);
  if (playlist) return playlist.tracks;
  const artist = lib.artists.find((a) => a.uri === uri);
  if (artist) return lib.tracks.filter((t) => t.artists[0]?.id === artist.id);
  const track = lib.tracks.find((t) => t.uri === uri);
  return track ? [track] : [];
}
