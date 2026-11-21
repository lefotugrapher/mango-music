import { usePlayer, usePlayerState } from '../session/hooks';
import { TrackRow } from '../ui/TrackRow';

export function QueueView() {
  const player = usePlayer();
  const { queue } = usePlayerState();

  // Skipping forward keeps the album or playlist that is playing. Starting a
  // new play request with just these tracks would discard it.
  const skipTo = async (index: number) => {
    for (let step = 0; step <= index; step++) await player.next();
  };
  return (
    <section className="np__panel" aria-label="Queue">
      <h3 className="np__panel-title">Up Next</h3>
      {queue.length === 0 ? (
        <p className="np__panel-empty">Nothing is queued.</p>
      ) : (
        <ol className="track-list" aria-label="Up Next">
          {queue.map((track, i) => (
            <li key={`${track.id}:${i}`}>
              <TrackRow
                track={track}
                showArtwork
                onPlay={() => void skipTo(i)}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
