import { battalionShortLabel } from "@/lib/battalions/label";
import type { Battalion, RosterEntry } from "@/lib/types";

/**
 * The soldier block the KAD pastes into WhatsApp.
 *
 * ONE FORMATTER, TWO BUTTONS. The per-row copy and the "copy the whole table" button both
 * come through here, so the single-soldier text and the text inside a multi-soldier paste
 * are the same bytes by construction rather than by two implementations agreeing.
 *
 * The layout is reproduced character-for-character from the sample supplied with the
 * request, including its inconsistencies — which are deliberate, not typos to tidy:
 *   - "מ.א: " and "שם מלא: " use colon-space, but "ת״ז " uses a bare space with NO colon.
 *   - "מילואים/ סדיר- " has a space after the slash and none before the dash.
 *   - "פיקוד - פצן" has spaces on BOTH sides of the dash, while "אוגדה- 146",
 *     "חטיבה- 228" and "גדוד- " have one only after it.
 * Normalising any of these would make the pasted message differ from what the units are
 * used to receiving, so they are preserved exactly.
 *
 * The asterisks are literal: WhatsApp renders *text* as bold, so the title line becomes
 * the bold certification name in the pasted message.
 */

/**
 * An invisible character that sits immediately before "מספר טלפון" in the supplied sample
 * — the kind of zero-width joiner that survives a copy out of WhatsApp.
 *
 * It is built from its codepoint rather than pasted in literally ON PURPOSE: an invisible
 * character sitting in a source string is invisible to the next reader too, survives no
 * round-trip through an editor that strips zero-width characters, and would be silently
 * dropped by the first person who retypes the line. Named and numeric, it is reviewable.
 *
 * If the pasted output ever needs to match a different invisible codepoint (U+200E LRM and
 * U+FEFF are the other common ones out of WhatsApp), this constant is the only edit.
 */
const PHONE_LABEL_PREFIX = String.fromCharCode(0x2060);

/** Fixed chain-of-command lines. Constant for every soldier this system handles. */
const COMMAND_LINES = ["פיקוד - פצן", "אוגדה- 146", "חטיבה- 228"] as const;

/** Between soldiers: a blank line, a "---" rule, then another blank line. */
export const SOLDIER_BLOCK_SEPARATOR = "\n\n---\n\n";

export interface SoldierCopyInput {
  /** Bold title line — the certification the soldier is on. */
  certificationName: string;
  /** מ.א — blank in the output when the soldier has no personal number yet. */
  personalNumber: string | null;
  fullName: string;
  phone: string | null;
  /**
   * ת״ז. NOT A COLUMN in `roster_entries` today, so it is always blank — the request was
   * explicit that no value may be invented and no migration added for it. The parameter
   * exists so that adding the column later is a one-line change at the call sites rather
   * than a change to this format.
   */
  nationalId?: string | null;
  /**
   * מילואים / סדיר. Also not a column today, so also always blank.
   *
   * `roster_entries.is_reserve` is deliberately NOT used here. That flag means עתודה —
   * standby for THIS certification — which is a completely different thing from a
   * soldier's service type. Mapping one to the other would put confident, wrong data into
   * a message someone acts on.
   */
  serviceType?: string | null;
  /**
   * גדוד — the battalion's label as the roster TABLE shows it, minus the redundant "גדוד "
   * prefix this block prints itself: "5030" for a numbered unit, "גדס"מ" for a named one.
   *
   * It used to be the battalion's `code`, which is a Latin slug for the non-numeric units
   * and pasted "גדוד- gdsm" into a message. Resolved by `battalionShortLabel` so this line
   * and the table cell cannot disagree again.
   */
  battalionLabel: string | null;
}

/** Empty rather than a dash or placeholder: the request asks for the label followed by
 * nothing when a value is missing. */
function value(v: string | null | undefined): string {
  return v?.trim() ? v.trim() : "";
}

/** One soldier, with no separator. */
export function formatSoldierBlock(input: SoldierCopyInput): string {
  return [
    `*${input.certificationName}*`,
    `מ.א: ${value(input.personalNumber)}`,
    `שם מלא: ${value(input.fullName)}`,
    `${PHONE_LABEL_PREFIX}מספר טלפון: ${value(input.phone)}`,
    // No colon here — see the note above; this matches the sample.
    `ת״ז ${value(input.nationalId)}`,
    `מילואים/ סדיר- ${value(input.serviceType)}`,
    ...COMMAND_LINES,
    `גדוד- ${value(input.battalionLabel)}`,
  ].join("\n");
}

/** Several soldiers, in the given order, joined by the "---" rule. */
export function formatSoldierBlocks(inputs: SoldierCopyInput[]): string {
  return inputs.map(formatSoldierBlock).join(SOLDIER_BLOCK_SEPARATOR);
}

/** Adapts a roster row plus its battalion into the formatter's input. */
export function rosterEntryToCopyInput(
  entry: RosterEntry,
  certificationName: string,
  battalion: Battalion | undefined
): SoldierCopyInput {
  return {
    certificationName,
    personalNumber: entry.personal_number,
    fullName: entry.full_name,
    phone: entry.phone,
    // Empty fallback, not the "ללא גדוד" placeholder: an unresolvable battalion leaves the
    // label with nothing after it, which is how every other missing value in this block
    // behaves and what the units already receive.
    battalionLabel: battalionShortLabel(battalion, ""),
  };
}
