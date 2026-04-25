// Shared color palette — light theme, warm and friendly

export const BG = "#f0eeeb";
export const BG_CANVAS = "#e8e5e0";
export const CARD = "#ffffff";
export const CARD_BORDER = "rgba(0,0,0,0.06)";
export const TEXT_PRIMARY = "#2a2a2e";
export const TEXT_SECONDARY = "#6b6b72";
export const TEXT_MUTED = "#9a9aa0";
export const TEXT_FAINT = "#c0c0c4";
export const ACCENT_GENUINE = "#3a9e6a";
export const ACCENT_SURFACE = "#d4853a";
export const ACCENT_GENUINE_BG = "rgba(58,158,106,0.08)";
export const ACCENT_SURFACE_BG = "rgba(212,133,58,0.08)";

// Agent position to color: warm rose (against) -> neutral gray -> calm blue (for)
export function positionToColor(position: number): string {
  const t = (position + 1) / 2; // 0 to 1
  const r = Math.round(210 - t * 80);  // 210 -> 130
  const g = Math.round(120 + t * 70);  // 120 -> 190
  const b = Math.round(130 + t * 70);  // 130 -> 200
  return `rgb(${r},${g},${b})`;
}

export function positionToColorRgb(position: number): [number, number, number] {
  const t = (position + 1) / 2;
  return [
    Math.round(210 - t * 80),
    Math.round(120 + t * 70),
    Math.round(130 + t * 70),
  ];
}
