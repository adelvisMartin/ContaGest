const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const light = {
  background: '#f4f5f7', surface: '#ffffff', surfaceSubtle: '#f8f9fb', surfaceRaised: '#eef0f4', elevated: '#ffffff', sidebar: '#fbfbfc', overlay: 'rgba(15,17,21,.44)',
  textPrimary: '#17191d', textSecondary: '#626874', textMuted: '#8b919c', textInverse: '#ffffff', border: '#e1e4e9', borderStrong: '#cfd3da', divider: '#e1e4e9', focus: '#6572ff',
  brand: '#5661e8', brandHover: '#4650ca', brandSoft: '#eef0ff', accent: '#5661e8', success: '#157357', successSoft: '#eaf7f1', warning: '#94620d', warningSoft: '#fff5df', danger: '#b52a35', dangerSoft: '#fff0f2', info: '#3766aa', infoSoft: '#edf4ff',
  interactiveHover: '#f8f9fb', interactivePressed: '#eef0f4', interactiveDisabled: '#f8f9fb', interactiveSelected: '#eef0ff'
};

const dark = {
  background: '#111214', surface: '#181a1d', surfaceSubtle: '#1f2125', surfaceRaised: '#272a2f', elevated: '#202226', sidebar: '#151619', overlay: 'rgba(0,0,0,.68)',
  textPrimary: '#f4f5f7', textSecondary: '#a4a9b2', textMuted: '#737984', textInverse: '#111214', border: '#2b2e34', borderStrong: '#3d4149', divider: '#2b2e34', focus: '#939bff',
  brand: '#7c86ff', brandHover: '#939bff', brandSoft: '#252942', accent: '#7c86ff', success: '#69c5a3', successSoft: '#1b3029', warning: '#e4b461', warningSoft: '#342c1e', danger: '#ef9299', dangerSoft: '#382326', info: '#8bb5eb', infoSoft: '#233244',
  interactiveHover: '#1f2125', interactivePressed: '#272a2f', interactiveDisabled: '#1f2125', interactiveSelected: '#252942'
};

const hipicoLight = {
  background: '#F4F5F2', surface: '#FFFFFF', surfaceSubtle: '#ECEFEA', surfaceRaised: '#F8F9F7', border: '#D7DCD6', borderStrong: '#B9C1BA', textPrimary: '#171A18', textSecondary: '#667069',
  brand: '#235C45', group: '#235C45', brandForeground: '#FFFFFF', brandHover: '#1B4937', brandSoft: '#E7F0EB', accent: '#A77B36', success: '#2D6A4F', successSoft: '#E9F3ED', warning: '#9A6B18', warningSoft: '#F8F0DE', danger: '#A23A43', dangerSoft: '#F8E9EB', info: '#3F647C', infoSoft: '#E9F0F4', focus: '#2F7A5B',
  shadowSmall: '0 1px 2px rgba(19,28,22,.04)', shadowMedium: '0 10px 28px rgba(19,28,22,.10)'
};

const hipicoDark = {
  background: '#0B0E0C', surface: '#121714', surfaceSubtle: '#18201B', surfaceRaised: '#151B17', border: '#2A352E', borderStrong: '#47564C', textPrimary: '#F3F6F3', textSecondary: '#A6B0A9',
  brand: '#79B891', group: '#79B891', brandForeground: '#08100B', brandHover: '#8BC7A2', brandSoft: '#173324', accent: '#D1AD6A', success: '#78C39D', successSoft: '#173326', warning: '#DBB568', warningSoft: '#312916', danger: '#E5848A', dangerSoft: '#351C20', info: '#8DB4CE', infoSoft: '#192A34', focus: '#8CCAA5',
  shadowSmall: '0 1px 2px rgba(0,0,0,.20)', shadowMedium: '0 12px 34px rgba(0,0,0,.34)'
};

const hipicoTypography = {
  metadata: '11px', label: '12px', body: '13px', touch: '14px', heading: '16px', section: '20px', page: '24px', kpi: '22px'
};

const hipicoControls = { small: '32px', default: '36px', primary: '38px', touch: '44px' };

export const SEMANTIC_TOKENS_V1 = deepFreeze({
  contract: 'contagest-semantic-design-tokens',
  version: '1.0.0',
  typography: {
    family: { sans: 'Inter, "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif', mono: '"JetBrains Mono", "Cascadia Code", ui-monospace, Menlo, Consolas, monospace' },
    roles: { metadata: '10px', label: '11px', dense: '12px', body: '13px', headingSmall: '15px', section: 'clamp(15px, 1.15vw, 17px)', page: 'clamp(20px, 1.55vw, 24px)', kpi: 'clamp(16px, 1.35vw, 20px)' },
    lineHeight: { tight: 1.18, body: 1.48 },
    weight: { regular: 400, medium: 500, semibold: 600, strong: 650, bold: 700 }
  },
  spacing: { none: '0', xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', xxl: '24px', xxxl: '32px' },
  radius: { xs: '5px', sm: '7px', control: '8px', md: '10px', lg: '12px', xl: '16px', pill: '9999px' },
  elevation: { lowLight: '0 1px 2px rgba(17,24,39,.035), 0 4px 14px rgba(17,24,39,.025)', highLight: '0 18px 48px rgba(17,24,39,.14)', lowDark: '0 1px 2px rgba(0,0,0,.20), 0 5px 18px rgba(0,0,0,.12)', highDark: '0 22px 60px rgba(0,0,0,.42)' },
  controls: { small: '32px', dense: '34px', tabs: '36px', default: '38px', touch: '44px', chip: '22px', horizontalPadding: '11px' },
  layout: { pageMax: '1600px', readingMax: '74ch', cardMin: '210px', kpiMin: '168px', tableRow: '40px', breakpoints: { mobile: 760, tablet: 1024, desktop: 1440 } },
  zIndex: { base: 0, sticky: 30, dropdown: 1000, overlay: 1200, modal: 1300, toast: 1400 },
  motion: { fast: '120ms', standard: '170ms', easing: 'cubic-bezier(.2,.75,.25,1)', reduced: '0ms' },
  density: { compactTableRow: '40px', comfortableTableRow: '44px', touchTarget: '44px' },
  color: { light, dark },
  products: {
    hipico: {
      variantReason: 'equestrian-operations',
      sharedPrimitives: ['typography.family.sans', 'controls.touch', 'motion', 'layout.breakpoints'],
      typography: hipicoTypography,
      controls: hipicoControls,
      radius: { xs: '4px', sm: '6px', md: '8px', lg: '10px', xl: '12px' },
      light: hipicoLight,
      dark: hipicoDark
    }
  }
});

export function normalizeThemeMode(mode = 'light') { return mode === 'dark' ? 'dark' : 'light'; }

export function getContaGestThemeTokens(mode = 'light') {
  const normalized = normalizeThemeMode(mode);
  return {
    mode: normalized,
    color: SEMANTIC_TOKENS_V1.color[normalized],
    typography: SEMANTIC_TOKENS_V1.typography,
    spacing: SEMANTIC_TOKENS_V1.spacing,
    radius: SEMANTIC_TOKENS_V1.radius,
    elevation: { low: normalized === 'dark' ? SEMANTIC_TOKENS_V1.elevation.lowDark : SEMANTIC_TOKENS_V1.elevation.lowLight, high: normalized === 'dark' ? SEMANTIC_TOKENS_V1.elevation.highDark : SEMANTIC_TOKENS_V1.elevation.highLight },
    controls: SEMANTIC_TOKENS_V1.controls,
    layout: SEMANTIC_TOKENS_V1.layout,
    zIndex: SEMANTIC_TOKENS_V1.zIndex,
    motion: SEMANTIC_TOKENS_V1.motion,
    density: SEMANTIC_TOKENS_V1.density
  };
}

export function getHipicoThemeTokens(mode = 'light') {
  const normalized = normalizeThemeMode(mode);
  return {
    mode: normalized,
    color: SEMANTIC_TOKENS_V1.products.hipico[normalized],
    radius: SEMANTIC_TOKENS_V1.products.hipico.radius,
    typography: SEMANTIC_TOKENS_V1.products.hipico.typography,
    spacing: SEMANTIC_TOKENS_V1.spacing,
    controls: SEMANTIC_TOKENS_V1.products.hipico.controls,
    layout: SEMANTIC_TOKENS_V1.layout,
    motion: SEMANTIC_TOKENS_V1.motion,
    zIndex: SEMANTIC_TOKENS_V1.zIndex
  };
}
