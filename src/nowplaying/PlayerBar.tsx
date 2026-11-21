import { MusicNote, SpeakerHigh, SpeakerLow, SpeakerNone } from '@phosphor-icons/react';
import { Glass } from '../glass/Glass';
import { Artwork } from '../ui/Artwork';
import { Slider } from '../ui/Slider';
import { Transport } from './Transport';
import { usePlaybackPosition, useTransport } from './usePlayback';
import './nowplaying.css';

export function VolumeIcon({ volume }: { volume: number }) {
  if (volume <= 0) return <SpeakerNone weight="fill" aria-hidden="true" />;
  return volume < 0.5 ? <SpeakerLow weight="fill" aria-hidden="true" /> : <SpeakerHigh weight="fill" aria-hidden="true" />;
}

/** The desktop player capsule (measured: 668 x 56, centred in the content area). */
export function PlayerBar({ onExpand }: { onExpand: () => void }) {
  const t = useTransport();
  const position = usePlaybackPosition();
  const track = t.state.track;
  const progress = track && track.durationMs > 0 ? Math.min(1, position / track.durationMs) : 0;

  return (
    <Glass className="playerbar" radius={28}>
      <Transport size="sm" />

      <button
        type="button"
        className="playerbar__lcd"
        aria-label={track ? `Open Now Playing: ${track.name}` : 'Open Now Playing'}
        disabled={!track}
        onClick={onExpand}
      >
        {track ? (
          <>
            <Artwork image={track.album.images[0]} alt="" size={40} radius={5} />
            <span className="playerbar__text">
              <span className="playerbar__title truncate">{track.name}</span>
              <span className="playerbar__artist truncate">{track.artists.map((a) => a.name).join(', ')}</span>
            </span>
            <span className="playerbar__progress" style={{ transform: `scaleX(${progress})` }} />
          </>
        ) : (
          <MusicNote className="playerbar__idle" weight="fill" aria-hidden="true" />
        )}
      </button>

      <div className="playerbar__volume">
        <VolumeIcon volume={t.state.volume} />
        <Slider
          label="Volume"
          value={Math.round(t.state.volume * 100)}
          max={100}
          step={5}
          formatValue={(v) => `${Math.round(v)}%`}
          onChange={(v) => t.setVolume(v / 100)}
        />
      </div>
    </Glass>
  );
}
