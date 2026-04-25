// WBWWB-inspired palette — high contrast, black & white, flat

export const BG = "#f8f8f8";
export const BG_CANVAS = "#f0f0f0";
export const CARD = "#ffffff";
export const CARD_BORDER = "rgba(0,0,0,0.12)";
export const TEXT_PRIMARY = "#1a1a1a";
export const TEXT_SECONDARY = "#4a4a4a";
export const TEXT_MUTED = "#8a8a8a";
export const TEXT_FAINT = "#c0c0c0";
export const ACCENT_GENUINE = "#2a2a2a";
export const ACCENT_SURFACE = "#8a8a8a";
export const ACCENT_GENUINE_BG = "rgba(0,0,0,0.06)";
export const ACCENT_SURFACE_BG = "rgba(0,0,0,0.04)";

// Agent position to fill: dark (against, -1) to light (for, +1)
// In WBWWB style — just grayscale fills inside black outlines
export function positionToColor(position: number): string {
  const t = (position + 1) / 2; // 0 to 1
  const v = Math.round(40 + t * 200); // 40 (dark) → 240 (light)
  return `rgb(${v},${v},${v})`;
}

export function positionToColorRgb(position: number): [number, number, number] {
  const t = (position + 1) / 2;
  const v = Math.round(40 + t * 200);
  return [v, v, v];
}
