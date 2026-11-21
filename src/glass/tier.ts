export type GlassTier = 'refract' | 'blur' | 'solid';
export type GlassSetting = 'auto' | 'blur' | 'solid';

export type GlassEnv = {
  isChromium: boolean;
  supportsBackdrop: boolean;
  supportsBackdropUrl: boolean;
  reducedTransparency: boolean;
  setting: GlassSetting;
};

/**
 * refract: SVG displacement in the backdrop. Only Chromium renders url()
 *          backdrop filters; other engines parse the syntax and draw nothing.
 * blur:    frosted glass, everywhere backdrop-filter exists.
 * solid:   opaque surfaces, for reduced transparency or no backdrop support.
 */
export function detectGlassTier(env: GlassEnv): GlassTier {
  if (env.reducedTransparency || env.setting === 'solid' || !env.supportsBackdrop) return 'solid';
  if (env.setting === 'blur') return 'blur';
  return env.isChromium && env.supportsBackdropUrl ? 'refract' : 'blur';
}

type BrandedNavigator = Navigator & { userAgentData?: { brands?: { brand: string }[] } };

export function readGlassEnv(setting: GlassSetting): GlassEnv {
  const supports = (prop: string, value: string) =>
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(prop, value);
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as BrandedNavigator | undefined;
  const brands = nav?.userAgentData?.brands;
  const isChromium = brands
    ? brands.some((b) => b.brand === 'Chromium')
    : /Chrome\/\d+/.test(nav?.userAgent ?? '') && !/Edg(e|A|iOS)?\/|OPR\//.test(nav?.userAgent ?? '');
  return {
    isChromium,
    supportsBackdrop: supports('backdrop-filter', 'blur(1px)') || supports('-webkit-backdrop-filter', 'blur(1px)'),
    supportsBackdropUrl: supports('backdrop-filter', 'url(#a)'),
    reducedTransparency:
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-transparency: reduce)').matches,
    setting,
  };
}
