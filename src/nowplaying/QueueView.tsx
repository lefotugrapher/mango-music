import { usePlayer, usePlayerState } from '../session/hooks';
import { TrackRow } from '../ui/TrackRow';

export function QueueView() {
  const player = usePlayer();
  const { queue } = usePlayerState();
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
                // Jumps ahead: plays this track and keeps what was queued after it.
                onPlay={() => void player.play({ uris: queue.slice(i).map((t) => t.uri) })}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
