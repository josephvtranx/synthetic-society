// Synthetic Society — Design Tokens (UX Redesign)

export const BG        = '#f4f1eb';   // warm off-white page background
export const BG_CANVAS = '#f0ece3';   // network graph canvas background
export const SURF      = '#ece8e0';   // panel / sidebar backgrounds
export const RAISED    = '#faf8f4';   // card / input backgrounds
export const CARD      = '#faf8f4';   // alias for compatibility

export const BORDER    = 'rgba(0,0,0,0.08)';
export const BORDER_MD = 'rgba(0,0,0,0.14)';

export const TEXT_PRIMARY   = '#1c1a14';
export const TEXT_SECONDARY = '#6a6050';
export const TEXT_MUTED     = '#b0a898';
// Legacy alias
export const TEXT_FAINT     = '#c0c0c0';

// Semantic accents — oklch
export const GENUINE   = 'oklch(48% 0.14 76)';   // amber — genuine belief shift
export const COMPLIANT = 'oklch(46% 0.11 188)';  // teal — surface compliance
export const ACTION    = 'oklch(48% 0.15 248)';  // indigo — primary CTA / selection
export const AGAINST   = 'oklch(50% 0.14 28)';   // coral — resistant / against

// Legacy aliases used by existing code
export const CARD_BORDER       = BORDER;
export const ACCENT_GENUINE    = GENUINE;
export const ACCENT_SURFACE    = COMPLIANT;
export const ACCENT_GENUINE_BG = 'rgba(0,0,0,0.06)';
export const ACCENT_SURFACE_BG = 'rgba(0,0,0,0.04)';

// Fonts
export const FONT_UI   = "'Space Grotesk', sans-serif";
export const FONT_MONO = "'JetBrains Mono', monospace";

// Agent position → fill colour (coral → slate → teal)
export function positionToColor(position: number): string {
  const t = (position + 1) / 2;
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const u = t * 2;
    r = Math.round(215 - u * 75); g = Math.round(95 + u * 55);  b = Math.round(80 + u * 65);
  } else {
    const u = (t - 0.5) * 2;
    r = Math.round(140 - u * 65); g = Math.round(150 + u * 45); b = Math.round(145 + u * 55);
  }
  return `rgb(${r},${g},${b})`;
}

export function positionToColorRgb(position: number): [number, number, number] {
  const t = (position + 1) / 2;
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const u = t * 2;
    r = Math.round(215 - u * 75); g = Math.round(95 + u * 55);  b = Math.round(80 + u * 65);
  } else {
    const u = (t - 0.5) * 2;
    r = Math.round(140 - u * 65); g = Math.round(150 + u * 45); b = Math.round(145 + u * 55);
  }
  return [r, g, b];
}

// Chibi helpers
function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export const hairColor   = (name: string) => `oklch(42% 0.18 ${strHash(name) % 360})`;
export const outfitColor = (name: string) => `oklch(72% 0.12 ${(strHash(name) * 7 + 137) % 360})`;
export const irisColor   = (name: string) => `oklch(38% 0.14 ${(strHash(name) * 13 + 60) % 360})`;
export const mouthPath   = (pos: number, cx = 0, cy = 0, w = 5) => {
  const lift = pos * 5;
  return `M ${cx - w} ${cy} Q ${cx} ${cy - lift} ${cx + w} ${cy}`;
};
