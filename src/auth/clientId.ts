import { parseClientId } from './redirect';

export type KnownClientId = { id: string; source: 'built-in' | 'stored' };

/**
 * Which Spotify Client ID to sign in with, if any is known.
 *
 * A copy of Pane can carry one in its build (`VITE_SPOTIFY_CLIENT_ID`), so the
 * people using that copy never see the setup step. A Client ID someone typed
 * in themselves wins over it. A Client ID is a public identifier, not a
 * secret: PKCE sign-in has no client secret at all.
 */
export function resolveClientId(i: { builtIn: string | null | undefined; stored: string | null }): KnownClientId | null {
  const stored = i.stored ? parseClientId(i.stored) : null;
  if (stored) return { id: stored, source: 'stored' };
  const builtIn = i.builtIn ? parseClientId(i.builtIn) : null;
  return builtIn ? { id: builtIn, source: 'built-in' } : null;
}

/** The Client ID configured for this build, untidied. */
export const configuredClientId = (): string | undefined => import.meta.env.VITE_SPOTIFY_CLIENT_ID;
