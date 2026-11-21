import { useState, type CSSProperties } from 'react';
import { Heart, Play, Shuffle } from '@phosphor-icons/react';
import type { Track } from '../domain/types';
import { usePlayer, usePlayerState } from '../session/hooks';
import { EmptyState } from '../ui/EmptyState';
import { TrackRow } from '../ui/TrackRow';
import { DetailHeader, Loading, useSentinel } from './shared';
import { songCount, useLikedSongs } from './useLikedSongs';

/**
 * Spotify has no documented way to say "play my liked songs", so playback is
 * started from a list of tracks. These bound that list: one request stays a
 * sensible size, and a shuffle does not wait on an enormous collection.
 */
const MAX_PLAY_URIS = 500;
const MAX_SHUFFLE_POOL = 1000;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The heart tile stands in for artwork: Liked Songs has no cover of its own. */
export function LikedArt() {
  return (
    <span className="liked-art" aria-hidden="true">
      <Heart weight="fill" />
    </span>
  );
}

export function LikedSongs() {
  const player = usePlayer();
  const state = usePlayerState();
  const { query, tracks, total } = useLikedSongs();
  const [shuffling, setShuffling] = useState(false);
  const sentinel = useSentinel(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  });

  // Unavailable songs are shown, greyed out, but never sent to Spotify to play.
  const playable = tracks.filter((track) => track.playable);

  const playFrom = (track?: Track) => {
    const at = track ? Math.max(0, playable.findIndex((t) => t.uri === track.uri)) : 0;
    const start =
      playable.length <= MAX_PLAY_URIS ? 0 : Math.min(Math.max(0, at - 50), playable.length - MAX_PLAY_URIS);
    const uris = playable.slice(start, start + MAX_PLAY_URIS).map((t) => t.uri);
    void player.play({ uris, index: at - start });
  };

  const shuffleAll = async () => {
    setShuffling(true);
    try {
      // A shuffle of only the first screenful is not a shuffle: bring in the
      // rest of the collection first, up to a sensible limit.
      let pages = query.data?.pages ?? [];
      let more = query.hasNextPage;
      while (more && pages.reduce((n, page) => n + page.items.length, 0) < MAX_SHUFFLE_POOL) {
        const result = await query.fetchNextPage();
        if (result.isError || !result.data) break;
        pages = result.data.pages;
        more = result.hasNextPage;
      }
      const pool = pages.flatMap((page) => page.items).filter((t) => t.playable);
      const uris = shuffled(pool)
        .slice(0, MAX_PLAY_URIS)
        .map((t) => t.uri);
      if (uris.length > 0) await player.play({ uris }, { shuffle: true });
    } finally {
      setShuffling(false);
    }
  };

  const nothingToPlay = playable.length === 0;

  return (
    <article className="detail detail--liked" style={{ '--tint': 'var(--accent)' } as CSSProperties}>
      <DetailHeader
        art={<LikedArt />}
        title="Liked Songs"
        meta={total != null ? songCount(total) : undefined}
        actions={
          <>
            <button type="button" className="btn btn--primary" disabled={nothingToPlay} onClick={() => playFrom()}>
              <Play weight="fill" aria-hidden="true" />
              Play
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={nothingToPlay || shuffling}
              onClick={() => void shuffleAll()}
            >
              <Shuffle weight="bold" aria-hidden="true" />
              Shuffle
            </button>
          </>
        }
      />

      {query.isPending && <Loading label="Loading your liked songs" />}
      {query.isError && tracks.length === 0 && (
        <EmptyState
          title="Liked Songs didn't load"
          body="Mango Music couldn't reach Spotify for your liked songs. They are still safe in your account."
          action={
            <button type="button" className="btn" onClick={() => void query.refetch()}>
              Retry
            </button>
          }
        />
      )}
      {query.data && tracks.length === 0 && (
        <EmptyState title="No liked songs yet" body="Like a song on Spotify and it shows up here." />
      )}
      {tracks.length > 0 && (
        <ol className="track-list" aria-label="Liked Songs">
          {tracks.map((track, i) => (
            <li key={`${track.id}:${i}`}>
              <TrackRow
                track={track}
                showArtwork
                active={state.track?.uri === track.uri}
                playing={state.status === 'playing'}
                onPlay={playFrom}
              />
            </li>
          ))}
        </ol>
      )}
      <div ref={sentinel} aria-hidden="true" />
      {query.isFetchingNextPage && <Loading label="Loading more" />}
    </article>
  );
}
