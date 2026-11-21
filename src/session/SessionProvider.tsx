import type { ReactNode } from 'react';
import type { Session } from '../domain/types';
import { SessionContext } from './hooks';

export function SessionProvider({ session, children }: { session: Session | null; children: ReactNode }) {
  return <SessionContext value={session}>{children}</SessionContext>;
}
