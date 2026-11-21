import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, XCircle } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ItemKind, Page as ResultPage, SearchResults, ShelfItem, Track } from '../domain/types';
import { usePlayer, usePlayerState, useSource } from '../session/hooks';
import { EmptyState } from '../ui/EmptyState';
import { TrackRow } from '../ui/TrackRow';
import { CardGrid, Loading, Page } from './shared';

const DEBOUNCE_MS = 250;

const GROUPS = [
  { kind: 'track', key: 'tracks', title: 'Songs', noun: 'songs' },
  { kind: 'artist', key: 'artists', title: 'Artists', noun: 'artists' },
  { kind: 'album', key: 'albums', title: 'Albums', noun: 'albums' },
  { kind: 'playlist', key: 'playlists', title: 'Playlists', noun: 'playlists' },
] as const satisfies readonly { kind: ItemKind; key: keyof SearchResults; title: string; noun: string }[];

type GroupKey = (typeof GROUPS)[number]['key'];
type Extra = { query: string; pages: Partial<Record<GroupKey, ResultPage<Track | ShelfItem>>> };

export function Search() {
  const source = useSource();
  const player = usePlayer();
  const state = usePlayerState();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState<Extra>({ query: '', pages: {} });
  const [loadingMore, setLoadingMore] = useState<GroupKey | null>(null);
  const currentQuery = useRef(query);
  currentQuery.current = query;

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Keyed by the query text, so an answer that arrives late lands in its own
  // cache entry and can never replace the results for what is typed now.
  const search = useQuery({
    queryKey: ['search', query],
    queryFn: () => source.search(query),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
  });

  const results = query.length > 0 ? search.data : undefined;

  /** The first page plus anything loaded with "Show more", for one group. */
  const group = (key: GroupKey): ResultPage<Track | ShelfItem> => {
    const first: ResultPage<Track | ShelfItem> = results?.[key] ?? { items: [], next: null };
    const more = extra.query === query && !search.isPlaceholderData ? extra.pages[key] : undefined;
    return more ? { items: [...first.items, ...more.items], next: more.next } : first;
  };

  const showMore = async (kind: ItemKind, key: GroupKey) => {
    const cursor = group(key).next;
    if (!cursor) return;
    const asked = query;
    setLoadingMore(key);
    try {
      const page = (await source.search(asked, kind, cursor))[key];
      if (currentQuery.current !== asked) return;
      setExtra((prev) => {
        const pages = prev.query === asked ? prev.pages : {};
        const before = pages[key]?.items ?? [];
        return { query: asked, pages: { ...pages, [key]: { items: [...before, ...page.items], next: page.next } } };
      });
    } catch {
      // Leave the button in place so the reader can try again.
    } finally {
      setLoadingMore(null);
    }
  };

  const hasAny = GROUPS.some(({ key }) => group(key).items.length > 0);

  return (
    <Page title="Search">
      <label className="search-field">
        <MagnifyingGlass className="search-field__icon" weight="bold" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search"
          placeholder="Artists, Songs, Albums and Playlists"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text && (
          <button type="button" className="search-field__clear" aria-label="Clear search" onClick={() => setText('')}>
            <XCircle weight="fill" aria-hidden="true" />
          </button>
        )}
      </label>

      {query.length === 0 && (
        <EmptyState title="Search Spotify" body="Find songs, artists, albums and playlists." />
      )}
      {query.length > 0 && search.isPending && <Loading label="Searching" />}
      {query.length > 0 && search.isError && (
        <EmptyState
          title="Search didn't work"
          body="Check your connection and try again."
          action={
            <button type="button" className="btn" onClick={() => void search.refetch()}>
              Retry
            </button>
          }
        />
      )}
      {results && !search.isPlaceholderData && !hasAny && <EmptyState title={`No results for “${query}”`} />}

      <div className="search-results" data-stale={search.isPlaceholderData || undefined}>
        {results &&
          GROUPS.map(({ kind, key, title, noun }) => {
            const page = group(key);
            if (page.items.length === 0) return null;
            return (
              <section key={key} className="search-group">
                <h2 className="page__section">{title}</h2>
                {kind === 'track' ? (
                  <ol className="track-list track-list--columns" aria-label="Songs">
                    {(page.items as Track[]).map((track, i) => (
                      <li key={`${track.id}:${i}`}>
                        <TrackRow
                          track={track}
                          showArtwork
                          active={state.track?.uri === track.uri}
                          playing={state.status === 'playing'}
                          onPlay={() => void player.play({ uris: [track.uri] })}
                        />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <CardGrid items={page.items as ShelfItem[]} />
                )}
                {page.next && (
                  <button
                    type="button"
                    className="btn search-group__more"
                    disabled={loadingMore === key}
                    onClick={() => void showMore(kind, key)}
                  >
                    Show more {noun}
                  </button>
                )}
              </section>
            );
          })}
      </div>
    </Page>
  );
}
