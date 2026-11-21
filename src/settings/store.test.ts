import { beforeEach, describe, expect, it } from 'vitest';
import { applySettings, DEFAULT_SETTINGS, loadSettings, useSettings } from './store';

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS });
});

describe('settings', () => {
  it('starts from defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists a change and applies it to the document', () => {
    useSettings.getState().update({ appearance: 'dark', reduceMotion: true });
    expect(JSON.parse(localStorage.getItem('pane.settings')!)).toEqual({
      appearance: 'dark',
      glass: 'auto',
      reduceMotion: true,
      glassiness: 50,
    });
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-reduce-motion', 'true');
    expect(loadSettings().appearance).toBe('dark');
  });

  it('removes the overrides again when set back to automatic', () => {
    useSettings.getState().update({ appearance: 'light', reduceMotion: true });
    useSettings.getState().update({ appearance: 'auto', reduceMotion: false });
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(document.documentElement).not.toHaveAttribute('data-reduce-motion');
  });

  it('falls back to defaults for a corrupt stored value', () => {
    localStorage.setItem('pane.settings', '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and replaces invalid ones', () => {
    localStorage.setItem('pane.settings', JSON.stringify({ appearance: 'neon', glass: 'solid', reduceMotion: 'yes' }));
    expect(loadSettings()).toEqual({ appearance: 'auto', glass: 'solid', reduceMotion: false, glassiness: 50 });
    localStorage.setItem('pane.settings', JSON.stringify(['dark']));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('turns glassiness into how opaque the glass is: 0 solid, 100 clearest', () => {
    useSettings.getState().update({ glassiness: 0 });
    expect(document.documentElement.style.getPropertyValue('--glass-opacity')).toBe('100%');
    useSettings.getState().update({ glassiness: 100 });
    expect(document.documentElement.style.getPropertyValue('--glass-opacity')).toBe('20%');
    useSettings.getState().update({ glassiness: 50 });
    expect(document.documentElement.style.getPropertyValue('--glass-opacity')).toBe('60%');
  });

  it('keeps a stored glassiness within range', () => {
    localStorage.setItem('pane.settings', JSON.stringify({ glassiness: 250 }));
    expect(loadSettings().glassiness).toBe(100);
    localStorage.setItem('pane.settings', JSON.stringify({ glassiness: 'lots' }));
    expect(loadSettings().glassiness).toBe(50);
  });

  it('applySettings is safe to call repeatedly', () => {
    applySettings({ ...DEFAULT_SETTINGS, appearance: 'dark' });
    applySettings({ ...DEFAULT_SETTINGS, appearance: 'dark' });
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
