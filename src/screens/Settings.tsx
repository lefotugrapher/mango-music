import { useQuery } from '@tanstack/react-query';
import type { GlassSetting } from '../glass/tier';
import { useSource } from '../session/hooks';
import { useSettings, type Appearance } from '../settings/store';
import { Page } from './shared';

type Props = {
  mode: 'demo' | 'spotify';
  /** Disconnects Spotify, or leaves the demo. */
  onDisconnect: () => void;
  onChangeClientId: () => void;
};

function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="settings__field">
      <legend className="settings__legend">{legend}</legend>
      <div className="segmented">
        {options.map((option) => (
          <label key={option.value} className="segmented__option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const APPEARANCE: readonly { value: Appearance; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const GLASS: readonly { value: GlassSetting; label: string }[] = [
  { value: 'auto', label: 'Best available' },
  { value: 'blur', label: 'Frosted' },
  { value: 'solid', label: 'Solid' },
];

export function Settings({ mode, onDisconnect, onChangeClientId }: Props) {
  const source = useSource();
  const me = useQuery({ queryKey: ['me'], queryFn: () => source.me() });
  const settings = useSettings();

  return (
    <Page title="Settings">
      <section className="settings__group" aria-labelledby="settings-account">
        <h2 id="settings-account" className="page__section">
          Account
        </h2>
        <div className="settings__card">
          <div className="settings__row">
            <span className="settings__name">{me.data?.name ?? '…'}</span>
            <span className="settings__hint">{mode === 'demo' ? 'Demo library' : 'Connected to Spotify'}</span>
          </div>
          <div className="settings__actions">
            {mode === 'demo' ? (
              <button type="button" className="btn" onClick={onDisconnect}>
                Exit demo
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={onDisconnect}>
                  Disconnect Spotify
                </button>
                <button type="button" className="btn" onClick={onChangeClientId}>
                  Change Client ID
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="settings__group" aria-labelledby="settings-look">
        <h2 id="settings-look" className="page__section">
          Look
        </h2>
        <div className="settings__card">
          <Segmented
            legend="Appearance"
            name="appearance"
            value={settings.appearance}
            options={APPEARANCE}
            onChange={(appearance) => settings.update({ appearance })}
          />
          <Segmented
            legend="Glass"
            name="glass"
            value={settings.glass}
            options={GLASS}
            onChange={(glass) => settings.update({ glass })}
          />
          <p className="settings__hint">
            Best available bends what is behind the glass in Chromium browsers and frosts it elsewhere. Solid turns
            transparency off.
          </p>
          <label className="settings__toggle">
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              onChange={(e) => settings.update({ reduceMotion: e.target.checked })}
            />
            <span>Reduce motion</span>
          </label>
        </div>
      </section>

      <section className="settings__group" aria-labelledby="settings-about">
        <h2 id="settings-about" className="page__section">
          About
        </h2>
        <div className="settings__card">
          <p className="settings__hint">
            Pane is an unofficial, non-commercial player. Music, artwork and playback come from Spotify through your
            own developer app; nothing leaves this browser except requests to Spotify.
          </p>
        </div>
      </section>
    </Page>
  );
}
