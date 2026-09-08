import type { CertificationFamily } from "@/lib/gaps/types";

const SYNTHETIC: Pick<CertificationFamily, "ink" | "line" | "bg">[] = [
  { ink: "#0f766e", line: "#99f6e4", bg: "#f0fdfa" },
  { ink: "#7c3aed", line: "#ddd6fe", bg: "#f5f3ff" },
  { ink: "#b45309", line: "#fde68a", bg: "#fffbeb" },
  { ink: "#be123c", line: "#fecdd3", bg: "#fff1f2" },
  { ink: "#1d4ed8", line: "#bfdbfe", bg: "#eff6ff" },
];

/** Stable negative id so a template domain that is not in `certification_families`
 * still groups as its own chip, without colliding with real serial ids. */
export function syntheticFamilyId(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const id = hash === 0 ? -1 : hash > 0 ? -hash : hash;
  return id;
}

export function syntheticFamily(name: string): CertificationFamily {
  const palette = SYNTHETIC[Math.abs(syntheticFamilyId(name)) % SYNTHETIC.length];
  return {
    id: syntheticFamilyId(name),
    name,
    sort_order: 800,
    ...palette,
  };
}

/**
 * Map a template/certification `domain` (e.g. "נהיגה", "רחפנים") onto a row in
 * `certification_families` (e.g. "נהיגה וניוד"). Exact name wins, then prefix.
 */
export function matchFamilyByDomain(
  domain: string | null | undefined,
  families: CertificationFamily[]
): CertificationFamily | undefined {
  const d = domain?.trim();
  if (!d) return undefined;
  return (
    families.find((f) => f.name === d) ??
    families.find((f) => f.name.startsWith(d) || d.startsWith(f.name))
  );
}

/**
 * Display family for a gap row: stored `family_id` if it still exists, otherwise
 * the template domain (same field the templates bank shows as תחום).
 */
export function displayFamilyForGap(
  familyId: number | null,
  templateDomain: string | null | undefined,
  families: CertificationFamily[]
): CertificationFamily | null {
  if (familyId != null) {
    const stored = families.find((f) => f.id === familyId);
    if (stored) return stored;
  }
  const matched = matchFamilyByDomain(templateDomain, families);
  if (matched) return matched;
  const d = templateDomain?.trim();
  if (d) return syntheticFamily(d);
  return null;
}
