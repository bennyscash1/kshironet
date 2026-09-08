function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Golden-angle hue rotation: consecutive indices land far apart on the color
 * wheel, so an unbounded number of courses each get a visually distinct color. */
export function paletteColorAt(index: number): string {
  const hue = (index * 137.508) % 360;
  return hslToHex(hue, 65, 45);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Fallback for certifications with no template-assigned color: hashes the name
 * into the same golden-angle palette so it's still distinct and stable per name. */
export function certificationColor(name: string): string {
  return paletteColorAt(hashString(name));
}
