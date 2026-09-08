import type { CSSProperties } from "react";

export function battalionChipStyle(colorHex: string): CSSProperties {
  return {
    backgroundColor: `${colorHex}22`,
    color: colorHex,
    borderColor: `${colorHex}55`,
  };
}

export function battalionBarStyle(colorHex: string): CSSProperties {
  return { backgroundColor: colorHex };
}

/** `battalions.color_hex` DEFAULT in the schema. */
const FALLBACK_COLOR = "#64748B";

function channels(colorHex: string): [number, number, number] | null {
  const hex = colorHex.trim().replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(0, 6);
  if (full.length !== 6 || !/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function mix(rgb: [number, number, number], towards: 0 | 255, amount: number): string {
  const [r, g, b] = rgb.map((c) => Math.round(c + (towards - c) * amount));
  return `rgb(${r} ${g} ${b})`;
}

/**
 * Tint for a battalion's total badge: a wash of its own colour behind text of the same
 * hue, darkened for light mode and lightened for dark mode so both stay readable whatever
 * the battalion's colour is (several are light enough to vanish on white if used raw).
 *
 * Emitted as concrete rgb()/8-digit-hex values in two CSS variables rather than
 * `color-mix()`, because these badges are also captured by html2canvas-pro for the PDF
 * export, which parses a much smaller slice of CSS colour syntax than the browser does.
 */
export function battalionBadgeStyle(colorHex: string): CSSProperties {
  // A battalion whose colour is missing or malformed still needs all three variables set:
  // the consuming classes are `var(--badge-bg)` etc., which would otherwise compute to
  // `unset` and leave an unstyled badge. Slate is the schema's own default colour.
  const rgb = channels(colorHex) ?? channels(FALLBACK_COLOR)!;
  const base = channels(colorHex) ? colorHex : FALLBACK_COLOR;
  return {
    "--badge-bg": `${base}2e`,
    "--badge-fg": mix(rgb, 0, 0.45),
    "--badge-fg-dark": mix(rgb, 255, 0.5),
  } as CSSProperties;
}
