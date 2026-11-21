import { createTokenStore, type TokenStore } from '../auth/spotifyAuth';
import type { PlayerEngine, Session } from '../domain/types';
import { createSpotifyClient } from '../spotify/client';
import { loadSdk } from '../spotify/sdk';
import { createSpotifyPlayer } from '../spotify/SpotifyPlayer';
import { createSpotifySource } from '../spotify/SpotifySource';
import { createUnavailablePlayer } from './unavailablePlayer';

export type SpotifySession = Session & { tokens: TokenStore };

/**
 * Builds the live session from stored tokens. If the Spotify player script
 * cannot load (offline, content blocker), the session still starts so the
 * library can be browsed, and the player explains itself.
 */
export async function createSpotifySession(clientId: string): Promise<SpotifySession> {
  const tokens = createTokenStore({ clientId });
  const client = createSpotifyClient({ tokens });
  const source = createSpotifySource({ client });

  let player: PlayerEngine;
  try {
    const sdk = await loadSdk();
    player = createSpotifyPlayer({ sdk, client, getToken: () => tokens.getAccessToken() });
  } catch {
    player = createUnavailablePlayer({
      kind: 'unsupported_browser',
      message: "The Spotify player didn't load. Check your connection or content blocker, then reload.",
    });
  }

  return { mode: 'spotify', source, player, tokens };
}
