import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { MusicSource, PlayerEngine, PlayerState, Session } from '../domain/types';

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside a SessionProvider with an active session.');
  return session;
}

export const useSource = (): MusicSource => useSession().source;
export const usePlayer = (): PlayerEngine => useSession().player;

export function usePlayerState(): PlayerState {
  const player = usePlayer();
  const subscribe = useCallback((cb: () => void) => player.subscribe(cb), [player]);
  const snapshot = useCallback(() => player.getState(), [player]);
  return useSyncExternalStore(subscribe, snapshot);
}
