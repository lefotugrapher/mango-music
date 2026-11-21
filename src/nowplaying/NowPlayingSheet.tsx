import { useEffect, useRef, useState } from 'react';
import { CaretDown, ListBullets, Screencast, SpeakerHigh, SpeakerNone } from '@phosphor-icons/react';
import { formatDuration } from '../lib/format';
import { spotifyUrl } from '../lib/spotifyUrl';
import { Artwork } from '../ui/Artwork';
import { IconButton } from '../ui/IconButton';
import { Slider } from '../ui/Slider';
import { SpotifyAttribution } from '../ui/SpotifyAttribution';
import { DevicePicker } from './DevicePicker';
import { MeshBackground } from './MeshBackground';
import { usePalette } from './palette';
import { QueueView } from './QueueView';
import { Transport } from './Transport';
import { usePlaybackPosition, useTransport } from './usePlayback';
import './nowplaying.css';

type Panel = 'none' | 'queue' | 'devices';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Sheet({ onClose }: { onClose: () => void }) {
  const t = useTransport();
  const position = usePlaybackPosition();
  const [panel, setPanel] = useState<Panel>('none');
  const root = useRef<HTMLDivElement | null>(null);
  const track = t.state.track;
  const palette = usePalette(track?.album.images[0]?.url);
  const duration = track?.durationMs ?? 0;

  // Move focus into the sheet, and hand it back to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !root.current) return;
      // Keep Tab inside the dialog.
      const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (next: Panel) => setPanel((current) => (current === next ? 'none' : next));

  return (
    <div
      ref={root}
      className="np"
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
      data-playing={t.playing ? 'true' : 'false'}
      data-panel={panel}
    >
      <MeshBackground colors={palette} />
      <div className="np__scrim" aria-hidden="true" />

      <header className="np__top">
        <IconButton label="Close" glass onClick={onClose}>
          <CaretDown weight="bold" aria-hidden="true" />
        </IconButton>
      </header>

      <div className="np__body">
        <div className="np__main">
          <div className="np__art">
            <Artwork image={track?.album.images[0]} alt="" radius={12} />
          </div>

          <div className="np__meta">
            <h2 className="np__title truncate">{track ? track.name : 'Not Playing'}</h2>
            {track && <p className="np__artist truncate">{track.artists.map((a) => a.name).join(', ')}</p>}
          </div>

          {t.state.error && (
            <div className="np__alert" role="alert">
              {t.state.error.message}
            </div>
          )}

          <div className="np__scrub">
            <Slider
              label="Position"
              value={Math.min(position, duration)}
              max={duration}
              step={5000}
              formatValue={formatDuration}
              onCommit={t.seek}
            />
            <div className="np__times">
              <span>{formatDuration(position)}</span>
              <span>-{formatDuration(Math.max(0, duration - position))}</span>
            </div>
          </div>

          <Transport size="lg" />

          <div className="np__volume">
            <SpeakerNone weight="fill" aria-hidden="true" />
            <Slider
              label="Volume"
              value={Math.round(t.state.volume * 100)}
              max={100}
              step={5}
              formatValue={(v) => `${Math.round(v)}%`}
              onChange={(v) => t.setVolume(v / 100)}
            />
            <SpeakerHigh weight="fill" aria-hidden="true" />
          </div>

          <div className="np__actions">
            <IconButton label="Devices" pressed={panel === 'devices'} onClick={() => toggle('devices')}>
              <Screencast weight="bold" aria-hidden="true" />
            </IconButton>
            {track && <SpotifyAttribution href={spotifyUrl(track.uri)} />}
            <IconButton label="Queue" pressed={panel === 'queue'} onClick={() => toggle('queue')}>
              <ListBullets weight="bold" aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        {panel === 'queue' && <QueueView />}
        {panel === 'devices' && <DevicePicker />}
      </div>
    </div>
  );
}

/** The full-screen player. Unmounted while closed, so it costs nothing then. */
export function NowPlayingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <Sheet onClose={onClose} /> : null;
}
