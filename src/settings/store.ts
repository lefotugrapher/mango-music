import { create } from 'zustand';
import type { GlassSetting } from '../glass/tier';
import { readJSON, writeJSON } from '../lib/storage';

export type Appearance = 'auto' | 'light' | 'dark';
/** glassiness: 0 is fully solid, 100 the clearest glass. */
export type Settings = { appearance: Appearance; glass: GlassSetting; reduceMotion: boolean; glassiness: number };

const KEY = 'pane.settings';
export const DEFAULT_SETTINGS: Settings = { appearance: 'auto', glass: 'auto', reduceMotion: false, glassiness: 50 };

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
    glassiness:
      typeof stored.glassiness === 'number' && Number.isFinite(stored.glassiness)
        ? Math.min(100, Math.max(0, Math.round(stored.glassiness)))
        : DEFAULT_SETTINGS.glassiness,
  };
}

/** Reflects settings onto <html>, where the stylesheets read them. */
export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  if (settings.appearance === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.appearance);
  if (settings.reduceMotion) root.setAttribute('data-reduce-motion', 'true');
  else root.removeAttribute('data-reduce-motion');
  // 0 -> fully opaque fill, 100 -> 20% fill. The default, 50, gives 60%: the
  // measured Apple Music value.
  root.style.setProperty('--glass-opacity', `${Math.round(100 - settings.glassiness * 0.8)}%`);
}

type SettingsStore = Settings & { update: (patch: Partial<Settings>) => void };

export const useSettings = create<SettingsStore>((set, get) => ({
  ...loadSettings(),
  update: (patch) => {
    set(patch);
    const { appearance, glass, reduceMotion, glassiness } = get();
    const next = { appearance, glass, reduceMotion, glassiness };
    writeJSON(KEY, next);
    applySettings(next);
  },
}));
