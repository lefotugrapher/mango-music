import { SpotifyLogo } from '@phosphor-icons/react';
import './ui.css';

/**
 * Spotify's design rules ask that their content is attributed with their mark
 * and links back to Spotify. Shown wherever an album, playlist, artist or the
 * current track is presented.
 */
export function SpotifyAttribution({ href }: { href: string }) {
  return (
    <a className="spotify-attr" href={href} target="_blank" rel="noreferrer noopener">
      <SpotifyLogo weight="fill" aria-hidden="true" />
      <span>Open in Spotify</span>
    </a>
  );
}
