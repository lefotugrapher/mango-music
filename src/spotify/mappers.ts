import type { Album, AlbumRef, Artist, ArtistRef, Image, ItemKind, Playlist, ShelfItem, Track } from '../domain/types';
import type {
  RawAlbum,
  RawArtist,
  RawArtistRef,
  RawImage,
  RawPlaylist,
  RawTrack,
  WebPlaybackTrack,
} from './raw';

function toImages(raw: RawImage[] | null | undefined): Image[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i) => i && typeof i.url === 'string')
    .map((i) => ({
      url: i.url,
      ...(typeof i.width === 'number' ? { width: i.width } : {}),
      ...(typeof i.height === 'number' ? { height: i.height } : {}),
    }));
}

function toArtistRefs(raw: RawArtistRef[] | undefined): ArtistRef[] {
  return (raw ?? []).filter(Boolean).map((a) => ({ id: a.id ?? lastSegment(a.uri) ?? '', name: a.name }));
}

function lastSegment(uri: string | undefined): string | undefined {
  return uri?.split(':').pop() || undefined;
}

const ALBUM_TYPES = ['album', 'single', 'compilation'] as const;

export function toAlbumRef(raw: RawAlbum): AlbumRef {
  const type = ALBUM_TYPES.find((t) => t === raw.album_type);
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    artists: toArtistRefs(raw.artists),
    images: toImages(raw.images),
    ...(raw.release_date ? { releaseDate: raw.release_date } : {}),
    ...(type ? { albumType: type } : {}),
  };
}

const NO_ALBUM: AlbumRef = { id: '', uri: '', name: '', artists: [], images: [] };

/** Null for anything that cannot be played from a list: gaps, local files, episodes. */
export function toTrack(raw: RawTrack | null | undefined, album?: AlbumRef): Track | null {
  if (!raw || !raw.id || raw.is_local) return null;
  if (raw.type !== undefined && raw.type !== 'track') return null;
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    artists: toArtistRefs(raw.artists),
    album: album ?? (raw.album ? toAlbumRef(raw.album) : NO_ALBUM),
    durationMs: raw.duration_ms ?? 0,
    explicit: raw.explicit ?? false,
    playable: raw.is_playable !== false,
  };
}

export function toAlbum(raw: RawAlbum, tracks: Track[]): Album {
  const copyright = raw.copyrights?.[0]?.text;
  return {
    ...toAlbumRef(raw),
    tracks,
    ...(raw.label ? { label: raw.label } : {}),
    ...(copyright ? { copyright } : {}),
    externalUrl: raw.external_urls?.spotify ?? '',
  };
}

export function toArtist(raw: RawArtist): Artist {
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    images: toImages(raw.images),
    externalUrl: raw.external_urls?.spotify ?? '',
  };
}

function ownerName(raw: RawPlaylist): string {
  return raw.owner?.display_name || raw.owner?.id || '';
}

export function toPlaylist(raw: RawPlaylist): Playlist {
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    description: raw.description ?? '',
    images: toImages(raw.images),
    ownerName: ownerName(raw),
    externalUrl: raw.external_urls?.spotify ?? '',
  };
}

const names = (artists: RawArtistRef[] | undefined) => (artists ?? []).map((a) => a.name).join(', ');

export function toShelfItem(raw: RawAlbum | RawArtist | RawPlaylist | RawTrack, kind: ItemKind): ShelfItem {
  let subtitle: string;
  let images: Image[];
  switch (kind) {
    case 'album': {
      const a = raw as RawAlbum;
      subtitle = names(a.artists);
      images = toImages(a.images);
      break;
    }
    case 'artist':
      subtitle = 'Artist';
      images = toImages((raw as RawArtist).images);
      break;
    case 'playlist':
      subtitle = ownerName(raw as RawPlaylist);
      images = toImages((raw as RawPlaylist).images);
      break;
    case 'track': {
      const t = raw as RawTrack;
      subtitle = names(t.artists);
      images = toImages(t.album?.images);
      break;
    }
  }
  const image = images[0];
  return { kind, id: raw.id ?? '', uri: raw.uri, title: raw.name, subtitle, ...(image ? { image } : {}) };
}

export function sdkTrackToTrack(raw: WebPlaybackTrack, fallbackDurationMs = 0): Track {
  const album: AlbumRef = {
    id: lastSegment(raw.album.uri) ?? '',
    uri: raw.album.uri,
    name: raw.album.name,
    artists: [],
    images: toImages(raw.album.images),
  };
  return {
    id: raw.id ?? lastSegment(raw.uri) ?? '',
    uri: raw.uri,
    name: raw.name,
    artists: raw.artists.map((a) => ({ id: lastSegment(a.uri) ?? '', name: a.name })),
    album,
    durationMs: raw.duration_ms ?? fallbackDurationMs,
    explicit: false,
    playable: raw.is_playable !== false,
  };
}
