import { useQuery } from '@tanstack/react-query';
import { useSource } from '../session/hooks';
import { EmptyState } from '../ui/EmptyState';
import { Shelf } from '../ui/Shelf';
import { Loading, Page, useOpenItem, usePlayItem } from './shared';

export function Home() {
  const source = useSource();
  const home = useQuery({ queryKey: ['home'], queryFn: () => source.home() });
  const onOpen = useOpenItem();
  const onPlay = usePlayItem();

  return (
    <Page title="Home">
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
