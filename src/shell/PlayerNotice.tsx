import { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { Glass } from '../glass/Glass';
import { usePlayerState } from '../session/hooks';
import './shell.css';

/**
 * Says why playback is not working (no Premium, no DRM, sign-in expired)
 * without getting in the way of browsing. Dismissing hides that message only;
 * a different problem shows again.
 */
export function PlayerNotice() {
  const { error } = usePlayerState();
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!error || dismissed === error.message) return null;
  return (
    <Glass className="player-notice" radius={18} refract={false} role="alert">
      <span>{error.message}</span>
      <button type="button" className="player-notice__close" aria-label="Dismiss" onClick={() => setDismissed(error.message)}>
        <X weight="bold" aria-hidden="true" />
      </button>
    </Glass>
  );
}
