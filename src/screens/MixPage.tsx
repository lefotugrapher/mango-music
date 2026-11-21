import { Play, Shuffle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { NotFoundError, type Track } from '../domain/types';
import { usePlayer, usePlayerState, useSource } from '../session/hooks';
import { EmptyState } from '../ui/EmptyState';
import { TrackRow } from '../ui/TrackRow';
import { DetailHeader, Loading, useTintStyle } from './shared';
import { songCount } from './useLikedSongs';

/**
 * A mix is a playlist assembled here from the listener's own history. Spotify
 * knows nothing about it, so it is played as a plain list of tracks.
 */
export function MixPage() {
  const { id = '' } = useParams();
  const source = useSource();
  const player = usePlayer();
  const state = usePlayerState();
  const query = useQuery({ queryKey: ['mix', id], queryFn: () => source.mix(id) });
  const tint = useTintStyle(query.data?.image);

  if (query.isPending) return <Loading label="Loading mix" />;
  if (query.isError) {
    return query.error instanceof NotFoundError ? (
      <EmptyState title="This mix isn't available" body="Your listening may have changed since Home was loaded." />
    ) : (
      <EmptyState
        title="This mix didn't load"
        body="Mango Music couldn't reach Spotify. Check your connection and try again."
        action={
          <button type="button" className="btn" onClick={() => void query.refetch()}>
            Retry
          </button>
        }
      />
    );
  }

  const mix = query.data;
  // Unavailable songs are listed, greyed out, but never sent to Spotify to play.
  const playable = mix.tracks.filter((track) => track.playable);
  const uris = playable.map((track) => track.uri);
  const playFrom = (track?: Track, shuffle = false) => {
    const index = track ? Math.max(0, playable.findIndex((t) => t.uri === track.uri)) : 0;
    if (shuffle) void player.play({ uris, index }, { shuffle: true });
    else void player.play({ uris, index });
  };

  return (
    <article className="detail" style={tint}>
      <DetailHeader
        image={mix.image}
        title={mix.title}
        meta={`Mix · ${songCount(mix.tracks.length)}`}
        description={mix.description}
        actions={
          <>
            <button type="button" className="btn btn--primary" disabled={uris.length === 0} onClick={() => playFrom()}>
              <Play weight="fill" aria-hidden="true" />
              Play
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={uris.length === 0}
              onClick={() => playFrom(undefined, true)}
            >
              <Shuffle weight="bold" aria-hidden="true" />
              Shuffle
            </button>
          </>
        }
      />

      <ol className="track-list" aria-label="Tracks">
        {mix.tracks.map((track, i) => (
          <li key={`${track.id}:${i}`}>
            <TrackRow
              track={track}
              showArtwork
              active={state.track?.uri === track.uri}
              playing={state.status === 'playing'}
              onPlay={(t) => playFrom(t)}
            />
          </li>
        ))}
      </ol>

      <footer className="detail__footer">
        <p>Made by Mango Music from your own listening.</p>
      </footer>
    </article>
  );
}
