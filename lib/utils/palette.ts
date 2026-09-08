/** Fixed fallback palette used when the course_colors table has no entries.
 * Distinct, calendar-friendly 6-digit hex colors (readable with white text). */
export const PRESET_PALETTE: string[] = [
  "#2563eb", // blue-600
  "#1d4ed8", // blue-700
  "#0ea5e9", // sky-500
  "#0891b2", // cyan-600
  "#0d9488", // teal-600
  "#0f766e", // teal-700
  "#059669", // emerald-600
  "#16a34a", // green-600
  "#15803d", // green-700
  "#65a30d", // lime-600
  "#ca8a04", // yellow-600
  "#d97706", // amber-600
  "#b45309", // amber-700
  "#ea580c", // orange-600
  "#dc2626", // red-600
  "#e11d48", // rose-600
  "#be123c", // rose-700
  "#db2777", // pink-600
  "#c026d3", // fuchsia-600
  "#9333ea", // purple-600
  "#7c3aed", // violet-600
  "#4f46e5", // indigo-600
  "#4b5563", // gray-600
  "#334155", // slate-700
];

/** Picks a color from the palette at random (used to pre-select a color when a
 * create form opens). */
export function randomPaletteColor(palette: string[]): string {
  if (palette.length === 0) return PRESET_PALETTE[0];
  return palette[Math.floor(Math.random() * palette.length)];
}
