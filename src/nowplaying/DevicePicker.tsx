import { useEffect } from 'react';
import { Check, Desktop, DeviceMobile, SpeakerHifi, Television } from '@phosphor-icons/react';
import type { Device } from '../domain/types';
import { usePlayer, usePlayerState } from '../session/hooks';

function DeviceIcon({ type }: { type: string }) {
  const kind = type.toLowerCase();
  if (kind.includes('phone') || kind.includes('tablet')) return <DeviceMobile aria-hidden="true" />;
  if (kind.includes('tv')) return <Television aria-hidden="true" />;
  if (kind.includes('speaker') || kind.includes('avr') || kind.includes('audio')) return <SpeakerHifi aria-hidden="true" />;
  return <Desktop aria-hidden="true" />;
}

const HERE = 'This browser';
const describe = (device: Device) =>
  device.isThisBrowser && device.name !== HERE ? `${device.name} · ${HERE}` : device.name;

/** Spotify Connect devices. Opening the picker asks Spotify for a fresh list. */
export function DevicePicker() {
  const player = usePlayer();
  const { devices } = usePlayerState();

  useEffect(() => {
    void player.refreshDevices();
  }, [player]);

  return (
    <section className="np__panel" aria-label="Devices">
      <h3 className="np__panel-title">Play On</h3>
      {devices.length === 0 ? (
        <p className="np__panel-empty">No devices found. Open Spotify on a device to see it here.</p>
      ) : (
        <ul className="np__devices">
          {devices.map((device) => (
            <li key={device.id}>
              <button
                type="button"
                className="np__device"
                aria-pressed={device.active}
                onClick={() => void player.transfer(device.id)}
              >
                <DeviceIcon type={device.type} />
                <span className="truncate">{describe(device)}</span>
                {device.active && <Check weight="bold" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
