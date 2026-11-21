import { Play, Shuffle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { usePlayer, usePlayerState, useSource } from '../session/hooks';
import { EmptyState } from '../ui/EmptyState';
import { SpotifyAttribution } from '../ui/SpotifyAttribution';
import { TrackRow } from '../ui/TrackRow';
import { DetailHeader, Loading, useTintStyle } from './shared';

export function PlaylistPage() {
  const { id = '' } = useParams();
  const source = useSource();
  const player = usePlayer();
  const state = usePlayerState();
  const playlist = useQuery({ queryKey: ['playlist', id], queryFn: () => source.playlist(id) });
  const tint = useTintStyle(playlist.data?.images[0]);

  if (playlist.isPending) return <Loading label="Loading playlist" />;
  if (playlist.isError) {
    return <EmptyState title="This playlist isn't available" body="It may be private, or the link is wrong." />;
  }

  const data = playlist.data;
  // null: Spotify withheld the list, but the playlist itself still plays.
  // []:   the playlist really is empty.
  const withheld = data.tracks === null;
  const empty = data.tracks !== null && data.tracks.length === 0;

  return (
    <article className="detail" style={tint}>
      <DetailHeader
        image={data.images[0]}
        title={data.name}
        subtitle={data.ownerName}
        meta={data.tracks ? `Playlist · ${data.tracks.length} ${data.tracks.length === 1 ? 'song' : 'songs'}` : 'Playlist'}
        description={data.description || undefined}
        actions={
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={empty}
              onClick={() => void player.play({ contextUri: data.uri })}
            >
              <Play weight="fill" aria-hidden="true" />
              Play
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={empty}
              onClick={() => void player.play({ contextUri: data.uri }, { shuffle: true })}
            >
              <Shuffle weight="bold" aria-hidden="true" />
              Shuffle
            </button>
          </>
        }
      />

      {withheld && (
        <p className="detail__note">Spotify doesn't share the track list for playlists you don't own.</p>
      )}
      {empty && <p className="detail__note">This playlist is empty.</p>}
      {data.tracks && data.tracks.length > 0 && (
        <ol className="track-list" aria-label="Tracks">
          {data.tracks.map((track, i) => (
            <li key={`${track.id}:${i}`}>
              <TrackRow
                track={track}
                showArtwork
                active={state.track?.uri === track.uri}
                playing={state.status === 'playing'}
                onPlay={() => void player.play({ contextUri: data.uri, offsetUri: track.uri })}
              />
            </li>
          ))}
        </ol>
      )}

      <footer className="detail__footer">
        <SpotifyAttribution href={data.externalUrl} />
      </footer>
    </article>
  );
}
