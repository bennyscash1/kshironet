import { query } from "@/lib/db/client";
import { normalizeCell } from "@/lib/import/parse-workbook";

/**
 * Canonical-name resolution, shared by the dry-run report and the writer so that what
 * the report promises is exactly what the import performs.
 *
 * The same certification appears in the source under several spellings — Hebrew
 * gershayim against ASCII quotes, a bare weapon name against its numbered variant, plain
 * typos. Left alone these become distinct certifications, each with its own permanently
 * unfillable gap. The alias table maps them onto one canonical name.
 *
 * Nothing is resolved silently: `appliedAliases` records every substitution so the dry
 * run can print it, which is how the NEXT typo gets noticed instead of absorbed.
 */

export interface AliasApplication {
  raw: string;
  canonical: string;
  kind: string;
  count: number;
}

export interface Canonicalizer {
  /** The canonical name, or null when the value is quarantined — not a certification at
   * all. The source has people's names in some certification columns. */
  resolve(raw: string): string | null;
  /** Every alias that resolve() actually applied, with hit counts. */
  appliedAliases(): AliasApplication[];
  /** Values seen that are quarantined, with hit counts. */
  quarantined(): AliasApplication[];
  /** True when the value has an alias entry of any kind. */
  hasAlias(raw: string): boolean;
}

interface AliasRow extends Record<string, unknown> {
  alias: string;
  canonical_name: string;
  kind: string;
}

/**
 * Loads the alias table.
 *
 * This is a READ. A dry run may read the database — what it must never do is write, and
 * it does not: no transaction is opened and no statement here is anything but a SELECT.
 */
export async function loadCanonicalizer(): Promise<Canonicalizer> {
  const rows = await query<AliasRow>(
    `SELECT alias, canonical_name, kind FROM certification_aliases`
  );
  const table = new Map(rows.map((r) => [normalizeCell(r.alias), r]));
  const applied = new Map<string, AliasApplication>();
  const quarantine = new Map<string, AliasApplication>();

  function bump(store: Map<string, AliasApplication>, entry: Omit<AliasApplication, "count">) {
    const existing = store.get(entry.raw);
    if (existing) existing.count += 1;
    else store.set(entry.raw, { ...entry, count: 1 });
  }

  return {
    resolve(raw: string): string | null {
      const key = normalizeCell(raw);
      const hit = table.get(key);
      if (!hit) return key;
      if (hit.kind === "quarantine") {
        bump(quarantine, { raw: key, canonical: key, kind: hit.kind });
        return null;
      }
      bump(applied, { raw: key, canonical: hit.canonical_name, kind: hit.kind });
      return hit.canonical_name;
    },
    appliedAliases: () => [...applied.values()].sort((a, b) => b.count - a.count),
    quarantined: () => [...quarantine.values()].sort((a, b) => b.count - a.count),
    hasAlias: (raw: string) => table.has(normalizeCell(raw)),
  };
}

/**
 * Canonicalizes a requirement expression, preserving its alternation syntax.
 *
 * "A / B" means the post is satisfied by either certification, so each side is resolved
 * independently and the separator is normalized to a single form.
 */
export function canonicalizeRequirement(
  requirement: string | null,
  canonicalizer: Canonicalizer
): string | null {
  if (!requirement) return null;
  const parts = requirement
    .split(/\s*\/\s*/)
    .map((part) => canonicalizer.resolve(part))
    .filter((part): part is string => part !== null && part !== "");
  return parts.length === 0 ? null : parts.join(" / ");
}
