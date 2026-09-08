/**
 * THE one place a battalion turns into text a human reads.
 *
 * THE BUG THIS EXISTS TO PREVENT. The roster table rendered `battalion.name` while the
 * WhatsApp clipboard block rendered `battalion.code`. For the four numbered battalions the
 * two are interchangeable — code "5030", name "גדוד 5030" — so the divergence was invisible
 * for years. It only surfaced on the non-numeric units, where the code is a Latin slug:
 * copying a גדס"מ soldier pasted `גדוד- gdsm` into a message a unit acts on.
 *
 * Both surfaces now resolve through here, so there is no second mapping to drift, and no
 * hardcoded `gdsm → גדס"מ` special case anywhere.
 *
 * THE GERSHAYIM IS WHATEVER THE DATABASE HOLDS. `battalions.name` stores גדס"מ with an
 * ASCII quote (U+0022), not the Hebrew gershayim (U+05F4). Nothing here normalises it: the
 * pasted text must match the table character-for-character, and "correcting" the quote
 * would make a WhatsApp paste differ from the screen it was copied from.
 */

/** The narrow slice of a battalion a label needs. Loose so any row shape can be passed —
 * `Battalion`, a report row, or a partial from a join. */
export interface BattalionLabelFields {
  name?: string | null;
  code?: string | null;
}

/** Shown when a battalion cannot be resolved at all. Hebrew and neutral; never an id. */
export const NO_BATTALION_LABEL = "ללא גדוד";

/** Numbered battalions are named "גדוד 5030", so a caller that prints its own "גדוד"
 * label would otherwise produce "גדוד- גדוד 5030". */
const NAME_PREFIX = "גדוד ";

function firstNonEmpty(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

/**
 * The battalion's display label: name → code → `fallback`.
 *
 * The id is deliberately not in the chain. A bare "3" on screen or in a pasted message is
 * worse than an honest placeholder, because it looks like a unit number.
 */
export function battalionLabel(
  battalion: BattalionLabelFields | null | undefined,
  fallback: string = NO_BATTALION_LABEL
): string {
  return firstNonEmpty(battalion?.name, battalion?.code) ?? fallback;
}

/**
 * The same label for a caller that ALREADY prints the word "גדוד" next to it — the
 * clipboard block's `גדוד- ` line being the one that matters.
 *
 * Same resolution chain, then the redundant "גדוד " prefix is dropped: "גדוד 5030" → "5030",
 * while "גדס"מ" has no prefix and passes through untouched. That is what keeps the numbered
 * battalions' output byte-identical to what the units already receive while the
 * non-numeric ones stop pasting a Latin slug.
 *
 * A name that is exactly "גדוד" keeps its text rather than collapsing to an empty string.
 */
export function battalionShortLabel(
  battalion: BattalionLabelFields | null | undefined,
  fallback: string = NO_BATTALION_LABEL
): string {
  const label = battalionLabel(battalion, fallback);
  if (!label.startsWith(NAME_PREFIX)) return label;
  const stripped = label.slice(NAME_PREFIX.length).trim();
  return stripped || label;
}
