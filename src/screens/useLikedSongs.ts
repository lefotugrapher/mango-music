import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSource } from '../session/hooks';

/**
 * The songs the person has liked on Spotify, loaded a page at a time. Home's
 * shortcut and the Liked Songs page share this query, so the first page is
 * fetched once.
 */
export function useLikedSongs() {
  const source = useSource();
  const query = useInfiniteQuery({
    queryKey: ['songs', 'pages'],
    queryFn: ({ pageParam }) => source.librarySongs(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const tracks = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  // Spotify reports the size of the whole collection with every page.
  const total = query.data ? (query.data.pages[0]?.total ?? (query.hasNextPage ? undefined : tracks.length)) : undefined;
  return { query, tracks, total };
}

const count = new Intl.NumberFormat('en');

export const songCount = (n: number) => `${count.format(n)} ${n === 1 ? 'song' : 'songs'}`;
