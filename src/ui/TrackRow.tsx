import type { Track } from '../domain/types';
import { formatDuration } from '../lib/format';
import { Artwork } from './Artwork';
import './ui.css';

type Props = {
  track: Track;
  /** 1-based position shown in the leading column. */
  index?: number;
  /** This row is the current track. */
  active?: boolean;
  /** The current track is playing right now. */
  playing?: boolean;
  showArtwork?: boolean;
  onPlay: (track: Track) => void;
};

export function TrackRow({ track, index, active = false, playing = false, showArtwork = false, onPlay }: Props) {
  const disabled = !track.playable;
  return (
    <button
      type="button"
      className="track-row"
      data-active={active || undefined}
      data-artwork={showArtwork || undefined}
      aria-disabled={disabled || undefined}
      aria-current={active ? 'true' : undefined}
      onClick={() => {
        if (!disabled) onPlay(track);
      }}
    >
      {index != null && (
        <span className="track-row__index">
          {active ? <span className="eq" data-playing={playing || undefined} aria-hidden="true" /> : index}
        </span>
      )}
      {showArtwork && <Artwork image={track.album.images[0]} alt="" size={40} radius={5} />}
      <span className="track-row__text">
        <span className="track-row__title">
          <span className="truncate">{track.name}</span>
          {track.explicit && (
            <span className="explicit" aria-label="Explicit">
              E
            </span>
          )}
        </span>
        <span className="track-row__artists truncate">{track.artists.map((a) => a.name).join(', ')}</span>
      </span>
      <span className="track-row__duration">{formatDuration(track.durationMs)}</span>
    </button>
  );
}
