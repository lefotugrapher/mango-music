import { FastForward, Pause, Play } from '@phosphor-icons/react';
import { Glass } from '../glass/Glass';
import { Artwork } from '../ui/Artwork';
import { IconButton } from '../ui/IconButton';
import { useTransport } from './usePlayback';
import './nowplaying.css';

/** The phone-width capsule that sits above the tab bar. */
export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const t = useTransport();
  const track = t.state.track;
  return (
    <Glass className="mini" radius={26}>
      <button
        type="button"
        className="mini__body"
        aria-label={track ? `Open Now Playing: ${track.name}` : 'Open Now Playing'}
        disabled={!track}
        onClick={onExpand}
      >
        <Artwork image={track?.album.images[0]} alt="" size={36} radius={6} />
        <span className="mini__text">
          <span className="mini__title truncate">{track ? track.name : 'Not Playing'}</span>
          {track && <span className="mini__artist truncate">{track.artists.map((a) => a.name).join(', ')}</span>}
        </span>
      </button>
      <IconButton label={t.playing ? 'Pause' : 'Play'} disabled={!track} onClick={t.toggle}>
        {t.playing ? <Pause weight="fill" aria-hidden="true" /> : <Play weight="fill" aria-hidden="true" />}
      </IconButton>
      <IconButton label="Next" disabled={!track} onClick={t.next}>
        <FastForward weight="fill" aria-hidden="true" />
      </IconButton>
    </Glass>
  );
}
