import { useInfiniteQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import type { LibraryGroup } from '../domain/types';
import { usePlayer, usePlayerState, useSource } from '../session/hooks';
import { EmptyState } from '../ui/EmptyState';
import { TrackRow } from '../ui/TrackRow';
import { CardGrid, Loading, Page, useSentinel } from './shared';

const TITLES = { playlists: 'Playlists', artists: 'Artists', albums: 'Albums', songs: 'Songs' } as const;
type Section = keyof typeof TITLES;
const isSection = (value: string | undefined): value is Section => value != null && value in TITLES;

const nextCursor = (page: { next: string | null }) => page.next ?? undefined;

function Groups({ group }: { group: LibraryGroup }) {
  const source = useSource();
  const query = useInfiniteQuery({
    queryKey: ['library', group, 'pages'],
    queryFn: ({ pageParam }) => source.library(group, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
  const sentinel = useSentinel(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      {query.isPending && <Loading />}
      {query.isError && <EmptyState title={`${TITLES[group]} didn't load`} body="Check your connection and try again." />}
      {query.data && items.length === 0 && (
        <EmptyState title={`No ${group} yet`} body={`${TITLES[group]} you save on Spotify show up here.`} />
      )}
      {items.length > 0 && <CardGrid items={items} />}
      <div ref={sentinel} aria-hidden="true" />
      {query.isFetchingNextPage && <Loading label="Loading more" />}
    </>
  );
}

function Songs() {
  const source = useSource();
  const player = usePlayer();
  const state = usePlayerState();
  const query = useInfiniteQuery({
    queryKey: ['songs', 'pages'],
    queryFn: ({ pageParam }) => source.librarySongs(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
  const sentinel = useSentinel(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  });
  const tracks = query.data?.pages.flatMap((page) => page.items) ?? [];
  const uris = tracks.map((track) => track.uri);

  return (
    <>
      {query.isPending && <Loading />}
      {query.isError && <EmptyState title="Songs didn't load" body="Check your connection and try again." />}
      {query.data && tracks.length === 0 && (
        <EmptyState title="No songs yet" body="Songs you like on Spotify show up here." />
      )}
      {tracks.length > 0 && (
        <ol className="track-list" aria-label="Songs">
          {tracks.map((track, i) => (
            <li key={`${track.id}:${i}`}>
              <TrackRow
                track={track}
                showArtwork
                active={state.track?.uri === track.uri}
                playing={state.status === 'playing'}
                onPlay={() => void player.play({ uris, index: i })}
              />
            </li>
          ))}
        </ol>
      )}
      <div ref={sentinel} aria-hidden="true" />
      {query.isFetchingNextPage && <Loading label="Loading more" />}
    </>
  );
}

export function LibrarySection() {
  const { group } = useParams();
  if (!isSection(group)) return <Navigate to="/library" replace />;
  return <Page title={TITLES[group]}>{group === 'songs' ? <Songs /> : <Groups group={group} />}</Page>;
}
