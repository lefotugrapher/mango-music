import { Glass } from '../glass/Glass';
import { demoArtwork } from '../demo/artwork';

const TILES = Array.from({ length: 36 }, (_, i) => demoArtwork(`lab-${i}`));

/** Dev-only bench for tuning the glass material against busy content. */
export function GlassLab() {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ padding: '32px 40px 160px 300px' }}>
        <h1 style={{ fontSize: 34, lineHeight: '40px', fontWeight: 700, marginBottom: 20 }}>Glass Lab</h1>
        <p style={{ maxWidth: 560, marginBottom: 24, color: 'var(--text-secondary)' }}>
          Scroll the tiles behind the surfaces. Edges should bend the picture, the middle should frost it, and the
          rim should catch light on two opposite corners.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 20 }}>
          {TILES.map((src, i) => (
            <div key={i}>
              <img src={src} alt="" style={{ width: '100%', aspectRatio: '1', borderRadius: 8 }} />
              <div style={{ marginTop: 6 }}>Sample title {i + 1}</div>
              <div style={{ color: 'var(--text-secondary)' }}>Sample artist</div>
            </div>
          ))}
        </div>
      </div>

      <Glass
        as="aside"
        radius={0}
        style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 260, padding: '36px 20px' }}
      >
        <strong>Regular · panel</strong>
      </Glass>

      <Glass
        radius={28}
        style={{
          position: 'fixed',
          left: 'calc(260px + (100% - 260px) / 2)',
          bottom: 18,
          width: 668,
          maxWidth: 'calc(100% - 300px)',
          height: 56,
          transform: 'translateX(-50%)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        Regular · player capsule
      </Glass>

      <Glass
        material="clear"
        radius={28}
        style={{
          position: 'fixed',
          left: 'calc(260px + (100% - 260px) / 2)',
          bottom: 92,
          width: 360,
          height: 56,
          transform: 'translateX(-50%)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        Clear · control
      </Glass>

      <Glass
        material="clear"
        radius={22}
        refract={false}
        style={{ position: 'fixed', right: 24, top: 24, width: 44, height: 44, display: 'grid', placeItems: 'center' }}
      >
        ···
      </Glass>
    </div>
  );
}
