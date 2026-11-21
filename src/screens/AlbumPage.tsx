import { Check, Play, Plus, Shuffle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { formatDuration } from '../lib/format';
import { usePlayer, usePlayerState, useSource } from '../session/hooks';
import { EmptyState } from '../ui/EmptyState';
import { IconButton } from '../ui/IconButton';
import { SpotifyAttribution } from '../ui/SpotifyAttribution';
import { TrackRow } from '../ui/TrackRow';
import { DetailHeader, Loading, useTintStyle } from './shared';

const TYPE_LABEL = { album: 'Album', single: 'Single', compilation: 'Compilation' } as const;

/** Add/remove toggle for anything that can be saved to the library. */
export function SaveButton({ uri }: { uri: string }) {
  const source = useSource();
  const client = useQueryClient();
  const key = ['saved', uri];
  const saved = useQuery({ queryKey: key, queryFn: async () => (await source.isSaved([uri]))[0] ?? false });
  const toggle = useMutation({
    mutationFn: (next: boolean) => source.setSaved([uri], next),
    onMutate: (next) => {
      const previous = client.getQueryData<boolean>(key);
      client.setQueryData(key, next);
      return { previous };
    },
    onError: (_error, _next, context) => client.setQueryData(key, context?.previous),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['recentlyAdded'] }),
  });
  if (saved.data === undefined) return null;
  return (
    <IconButton
      label={saved.data ? 'Remove from Library' : 'Add to Library'}
      className="detail__save"
      onClick={() => toggle.mutate(!saved.data)}
    >
      {saved.data ? <Check weight="bold" aria-hidden="true" /> : <Plus weight="bold" aria-hidden="true" />}
    </IconButton>
  );
}

export function AlbumPage() {
  const { id = '' } = useParams();
  const source = useSource();
  const player = usePlayer();
  const state = usePlayerState();
  const album = useQuery({ queryKey: ['album', id], queryFn: () => source.album(id) });
  const tint = useTintStyle(album.data?.images[0]);

  if (album.isPending) return <Loading label="Loading album" />;
  if (album.isError) {
    return <EmptyState title="This album isn't available" body="It may have been removed, or the link is wrong." />;
  }

  const data = album.data;
  const year = data.releaseDate?.slice(0, 4);
  const total = data.tracks.reduce((sum, track) => sum + track.durationMs, 0);
  const meta = [data.albumType ? TYPE_LABEL[data.albumType] : null, year].filter(Boolean).join(' · ');

  return (
    <article className="detail" style={tint}>
      <DetailHeader
        image={data.images[0]}
        title={data.name}
        subtitle={data.artists.map((artist, i) => (
          <span key={artist.id}>
            {i > 0 && ', '}
            <Link to={`/artist/${artist.id}`}>{artist.name}</Link>
          </span>
        ))}
        meta={meta}
        actions={
          <>
            <button type="button" className="btn btn--primary" onClick={() => void player.play({ contextUri: data.uri })}>
              <Play weight="fill" aria-hidden="true" />
              Play
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void player.play({ contextUri: data.uri }, { shuffle: true })}
            >
              <Shuffle weight="bold" aria-hidden="true" />
              Shuffle
            </button>
            <SaveButton uri={data.uri} />
          </>
        }
      />

      <ol className="track-list" aria-label="Tracks">
        {data.tracks.map((track, i) => (
          <li key={track.id}>
            <TrackRow
              track={track}
              index={i + 1}
              active={state.track?.uri === track.uri}
              playing={state.status === 'playing'}
              onPlay={() => void player.play({ contextUri: data.uri, offsetUri: track.uri })}
            />
          </li>
        ))}
      </ol>

      <footer className="detail__footer">
        <p>
          {data.tracks.length} {data.tracks.length === 1 ? 'song' : 'songs'}, {formatDuration(total)}
        </p>
        {data.copyright && <p>{data.copyright}</p>}
        <SpotifyAttribution href={data.externalUrl} />
      </footer>
    </article>
  );
}
