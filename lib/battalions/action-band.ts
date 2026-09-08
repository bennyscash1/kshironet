/**
 * The summary line above the battalion's "הסמכות הממתינות לפעולה" band.
 *
 * Pure and separate from the component because the interesting case is not the arithmetic
 * but the ABSENCE of it: a certification with NULL capacity is unlimited, and unlimited has
 * no number that can be added to a total. Every alternative — treating NULL as 0, as the
 * capacity, or as the seats already taken — invents a figure the data does not contain and
 * puts it in front of a unit that will plan against it.
 */

/** Hebrew for "no cap", used wherever a NULL capacity would otherwise become a number. */
export const UNLIMITED_SEATS = "ללא הגבלה";

export interface ActionBandSummary {
  /** Certifications across BOTH groups. */
  certCount: number;
  /** True when there is nothing to act on, so the band renders neutral rather than amber. */
  empty: boolean;
  /** Free seats, ready to render: a number, "ללא הגבלה", or "N + ללא הגבלה" when the two
   * kinds are mixed and neither may swallow the other. */
  slotsLabel: string;
}

export function summarizeActionBand(
  /** Group A: seats allocated to this battalion that still need names. */
  awaitingNames: { remaining: number }[],
  /** Group B: open to all. `remaining: null` means unlimited. */
  openToAll: { remaining: number | null }[]
): ActionBandSummary {
  const certCount = awaitingNames.length + openToAll.length;
  const bounded =
    awaitingNames.reduce((s, a) => s + a.remaining, 0) +
    openToAll.reduce((s, c) => s + (c.remaining ?? 0), 0);
  const hasUnlimited = openToAll.some((c) => c.remaining === null);

  return {
    certCount,
    empty: certCount === 0,
    slotsLabel: hasUnlimited
      ? bounded > 0
        ? `${bounded} + ${UNLIMITED_SEATS}`
        : UNLIMITED_SEATS
      : String(bounded),
  };
}
