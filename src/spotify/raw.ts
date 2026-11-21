/**
 * Raw Spotify shapes (verified against the reference pages, Nov 2026).
 * Only the fields Pane reads are typed; everything Spotify may omit or null is optional.
 *
 * Library:  PUT /me/library?uris=a,b (save) and DELETE /me/library?uris=a,b (remove).
 *           `uris` is a QUERY parameter, comma-separated, max 40 per call, no body.
 *           GET /me/library/contains?uris=a,b -> boolean[] in the same order.
 * Playlist: GET /playlists/{id} embeds `items` (a paging object) only when the user
 *           owns or collaborates on it; the old `tracks` field is deprecated. Each
 *           element is { added_at, is_local, item } where `track` is a deprecated
 *           alias of `item`. Elements and `item` can be null.
 *           GET /playlists/{id}/items?limit<=50&offset returns 403 when the user
 *           neither owns nor collaborates.
 * Following: GET /me/following?type=artist&limit<=50&after= -> { artists: { items, next, cursors: { after } } }.
 * Artist albums: GET /artists/{id}/albums limit is capped at 10.
 * Search:   limit<=10, offset 0..1000; paging items may contain nulls.
 * Track:    id is null for local files; type is 'track' or 'episode'.
 */

export type RawImage = { url: string; width?: number | null; height?: number | null };
export type RawArtistRef = { id?: string | null; uri?: string; name: string };

export type RawPaging<T> = { items: (T | null)[]; next: string | null; total?: number };

export type RawAlbum = {
  id: string;
  uri: string;
  name: string;
  album_type?: string;
  release_date?: string;
  label?: string;
  copyrights?: { text: string; type: string }[];
  external_urls?: { spotify?: string };
  images?: RawImage[] | null;
  artists?: RawArtistRef[];
  tracks?: RawPaging<RawTrack>;
};

export type RawTrack = {
  id: string | null;
  uri: string;
  name: string;
  type?: string;
  duration_ms?: number;
  explicit?: boolean;
  is_playable?: boolean;
  is_local?: boolean;
  artists?: RawArtistRef[];
  album?: RawAlbum;
};

export type RawArtist = {
  id: string;
  uri: string;
  name: string;
  images?: RawImage[] | null;
  external_urls?: { spotify?: string };
};

export type RawPlaylist = {
  id: string;
  uri: string;
  name: string;
  description?: string | null;
  images?: RawImage[] | null;
  owner?: { id?: string; display_name?: string | null };
  external_urls?: { spotify?: string };
};

export type RawPlaylistItem = { added_at?: string | null; is_local?: boolean; item?: RawTrack | null; track?: RawTrack | null };
export type RawPlaylistDetail = RawPlaylist & { items?: RawPaging<RawPlaylistItem> };

export type RawMe = { id: string; display_name?: string | null; images?: RawImage[] | null };

export type RawPlayerResponse = {
  device?: { id?: string | null; volume_percent?: number | null } | null;
  shuffle_state?: boolean;
  repeat_state?: string;
  progress_ms?: number | null;
  is_playing?: boolean;
  item?: RawTrack | null;
};
export type RawDevices = {
  devices: { id: string | null; is_active: boolean; name: string; type: string; volume_percent?: number | null }[];
};

/** Web Playback SDK. */
export type WebPlaybackTrack = {
  uri: string;
  id?: string | null;
  type?: string;
  name: string;
  is_playable?: boolean;
  duration_ms?: number;
  album: { uri: string; name: string; images?: { url: string }[] };
  artists: { uri: string; name: string }[];
};
export type WebPlaybackState = {
  paused: boolean;
  position: number;
  duration?: number;
  /** 0 off, 1 context, 2 track */
  repeat_mode: number;
  shuffle: boolean;
  track_window: {
    current_track: WebPlaybackTrack | null;
    previous_tracks: WebPlaybackTrack[];
    next_tracks: WebPlaybackTrack[];
  };
  context?: { uri?: string | null } | null;
};
