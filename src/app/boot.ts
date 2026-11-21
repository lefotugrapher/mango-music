export type BootAction = 'complete_login' | 'restore' | 'setup';

/** What to do when the app loads, from the address and what is stored. */
export function decideBoot(i: { url: URL; clientId: string | null; hasTokens: boolean }): BootAction {
  if (i.url.searchParams.has('code') || i.url.searchParams.has('error')) return 'complete_login';
  return i.clientId && i.hasTokens ? 'restore' : 'setup';
}

/** The address with Spotify's redirect parameters removed, so a reload does not replay them. */
export function withoutAuthParams(url: URL): string {
  const clean = new URL(url.href);
  for (const key of ['code', 'state', 'error']) clean.searchParams.delete(key);
  return clean.href;
}

export type NoticeReason = 'denied' | 'state_mismatch' | 'exchange_failed' | 'signed_out' | 'forbidden' | 'start_failed';

const NOTICES: Record<NoticeReason, string> = {
  denied: 'Spotify sign-in was cancelled.',
  state_mismatch: "Sign-in didn't complete. Try again.",
  exchange_failed: "Sign-in didn't complete. Try again.",
  signed_out: 'Spotify signed you out. Connect again.',
  forbidden:
    "This Spotify account isn't on the app's user list. Add it under User Management in the Spotify dashboard.",
  start_failed: "Pane couldn't start Spotify. Try connecting again.",
};

export const noticeFor = (reason: NoticeReason): string => NOTICES[reason];
