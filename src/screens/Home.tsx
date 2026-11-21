import { CaretRight } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useSource } from '../session/hooks';
import { EmptyState } from '../ui/EmptyState';
import { Shelf } from '../ui/Shelf';
import { LikedArt } from './LikedSongs';
import { Loading, Page, useOpenItem, usePlayItem } from './shared';
import { songCount, useLikedSongs } from './useLikedSongs';

/** Liked Songs is what most people open first, so Home keeps it one click away. */
function LikedShortcut() {
  const { total } = useLikedSongs();
  return (
    <Link to="/library/songs" className="liked-tile">
      <LikedArt />
      <span className="liked-tile__text">
        <span className="liked-tile__title">Liked Songs</span>
        <span className="liked-tile__count">{total != null ? songCount(total) : ' '}</span>
      </span>
      <CaretRight className="liked-tile__chevron" weight="bold" aria-hidden="true" />
    </Link>
  );
}

export function Home() {
  const source = useSource();
  const home = useQuery({ queryKey: ['home'], queryFn: () => source.home() });
  const onOpen = useOpenItem();
  const onPlay = usePlayItem();

  return (
    <Page title="Home">
      <LikedShortcut />
      {home.isPending && <Loading label="Loading Home" />}
      {home.isError && (
        <EmptyState
          title="Home didn't load"
          body="Check your connection and try again."
          action={
            <button type="button" className="btn" onClick={() => void home.refetch()}>
              Retry
            </button>
          }
        />
      )}
      {home.data && home.data.length === 0 && (
        <EmptyState title="Nothing here yet" body="Play something on Spotify and it will show up here." />
      )}
      {home.data?.map((shelf) => (
        <Shelf key={shelf.id} title={shelf.title} items={shelf.items} onOpen={onOpen} onPlay={onPlay} />
      ))}
    </Page>
  );
}
