import { useSyncExternalStore } from 'react';

/**
 * Installing Mango Music as an app. Chrome and Edge fire `beforeinstallprompt`
 * and can show their own install dialog from a button; Safari on the Mac has
 * no such event, so people use File > Add to Dock.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallState = { installed: boolean; canPrompt: boolean };

let deferred: InstallPromptEvent | null = null;
let state: InstallState = { installed: false, canPrompt: false };
const listeners = new Set<() => void>();

function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function installState(): InstallState {
  return state;
}

/** True when the page is running in its own app window rather than a browser tab. */
export function runningAsApp(win: Window = window): boolean {
  const standalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || (typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches);
}

/** Starts listening; call once, as early as possible, since the event fires soon after load. */
export function listenForInstall(win: Window = window): () => void {
  if (runningAsApp(win)) set({ installed: true });
  const onPrompt = (event: Event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    set({ canPrompt: true });
  };
  const onInstalled = () => {
    deferred = null;
    set({ installed: true, canPrompt: false });
  };
  win.addEventListener('beforeinstallprompt', onPrompt);
  win.addEventListener('appinstalled', onInstalled);
  return () => {
    win.removeEventListener('beforeinstallprompt', onPrompt);
    win.removeEventListener('appinstalled', onInstalled);
  };
}

/** Shows the browser's install dialog. Resolves true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  set({ canPrompt: false });
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}

export type BrowserKind = 'safari' | 'chromium' | 'other';

export function browserKind(userAgent: string = navigator.userAgent): BrowserKind {
  if (/Chrome\/|Chromium\/|Edg\//.test(userAgent)) return 'chromium';
  if (/Firefox\//.test(userAgent)) return 'other';
  if (/Version\/[\d.]+.*Safari\//.test(userAgent)) return 'safari';
  return 'other';
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    installState,
    installState,
  );
}

export function resetInstallForTests() {
  deferred = null;
  state = { installed: false, canPrompt: false };
}
