import { useMemo } from 'react';
import { GlassFilterHost } from '../glass/GlassFilterHost';
import { detectGlassTier, readGlassEnv } from '../glass/tier';
import { GlassLab } from '../screens/GlassLab';

export function App() {
  const tier = useMemo(() => detectGlassTier(readGlassEnv('auto')), []);
  return (
    <GlassFilterHost tier={tier}>
      <GlassLab />
    </GlassFilterHost>
  );
}
