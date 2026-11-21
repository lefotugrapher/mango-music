import { create } from 'zustand';
import type { GlassSetting } from '../glass/tier';
import { readJSON, writeJSON } from '../lib/storage';

export type Appearance = 'auto' | 'light' | 'dark';
export type Settings = { appearance: Appearance; glass: GlassSetting; reduceMotion: boolean };

const KEY = 'pane.settings';
export const DEFAULT_SETTINGS: Settings = { appearance: 'auto', glass: 'auto', reduceMotion: false };

const APPEARANCES: readonly Appearance[] = ['auto', 'light', 'dark'];
const GLASS: readonly GlassSetting[] = ['auto', 'blur', 'solid'];

/** Reads stored settings field by field: anything missing or invalid becomes the default. */
export function loadSettings(): Settings {
  const raw = readJSON<unknown>(KEY, null);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const stored = raw as Record<string, unknown>;
  return {
    appearance: APPEARANCES.includes(stored.appearance as Appearance)
      ? (stored.appearance as Appearance)
      : DEFAULT_SETTINGS.appearance,
    glass: GLASS.includes(stored.glass as GlassSetting) ? (stored.glass as GlassSetting) : DEFAULT_SETTINGS.glass,
    reduceMotion: typeof stored.reduceMotion === 'boolean' ? stored.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
  };
}

/** Reflects settings onto <html>, where the stylesheets read them. */
export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  if (settings.appearance === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.appearance);
  if (settings.reduceMotion) root.setAttribute('data-reduce-motion', 'true');
  else root.removeAttribute('data-reduce-motion');
}

type SettingsStore = Settings & { update: (patch: Partial<Settings>) => void };

export const useSettings = create<SettingsStore>((set, get) => ({
  ...loadSettings(),
  update: (patch) => {
    set(patch);
    const { appearance, glass, reduceMotion } = get();
    const next = { appearance, glass, reduceMotion };
    writeJSON(KEY, next);
    applySettings(next);
  },
}));
