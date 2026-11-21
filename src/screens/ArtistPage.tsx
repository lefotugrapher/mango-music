import { Play, Shuffle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { usePlayer, useSource } from '../session/hooks';
import { EmptyState } from '../ui/EmptyState';
import { Shelf } from '../ui/Shelf';
import { SpotifyAttribution } from '../ui/SpotifyAttribution';
import { albumToItem, DetailHeader, Loading, useOpenItem, usePlayItem } from './shared';

/**
 * Albums and singles only: Spotify removed the artist top-tracks endpoint for
 * new apps, so there is no "Top Songs" to show.
 */
export function ArtistPage() {
  const { id = '' } = useParams();
  const source = useSource();
  const player = usePlayer();
  const onOpen = useOpenItem();
  const onPlay = usePlayItem();
  const query = useQuery({ queryKey: ['artist', id], queryFn: () => source.artist(id) });

  if (query.isPending) return <Loading label="Loading artist" />;
  if (query.isError) {
    return <EmptyState title="This artist isn't available" body="The link may be wrong." />;
  }

  const { artist, albums, singles } = query.data;

  return (
    <article className="detail detail--artist">
      <DetailHeader
        image={artist.images[0]}
        shape="circle"
        title={artist.name}
        meta="Artist"
        actions={
          <>
            <button type="button" className="btn btn--primary" onClick={() => void player.play({ contextUri: artist.uri })}>
              <Play weight="fill" aria-hidden="true" />
              Play
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void player.play({ contextUri: artist.uri }, { shuffle: true })}
            >
              <Shuffle weight="bold" aria-hidden="true" />
              Shuffle
            </button>
          </>
        }
      />

      <Shelf title="Albums" items={albums.map(albumToItem)} onOpen={onOpen} onPlay={onPlay} />
      <Shelf title="Singles & EPs" items={singles.map(albumToItem)} onOpen={onOpen} onPlay={onPlay} />
      {albums.length === 0 && singles.length === 0 && (
        <p className="detail__note">No releases to show for this artist.</p>
      )}

      <footer className="detail__footer">
        <SpotifyAttribution href={artist.externalUrl} />
      </footer>
    </article>
  );
}
