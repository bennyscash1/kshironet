/**
 * Planning the write-back of an edit-session snapshot ("חזור" on the canvas).
 *
 * Kept separate from the SQL that applies it, because the interesting part is not the
 * statements — it is deciding which post gets an UPDATE, which gets a DELETE, and which
 * needs a fresh row. Two constraints shape that decision, and getting either wrong is not
 * a visible bug, it is a quietly wrong establishment:
 *
 *   1. ASSIGNMENT IDS ARE NOT STABLE ACROSS A SESSION. Moving a soldier to the 120% bank
 *      deletes their `role_assignments` row and inserts a `bank_soldiers` one; moving them
 *      back inserts a brand-new assignment with a new id. So the snapshot cannot be matched
 *      to the present by assignment id. `role_id` is the one identifier a move never
 *      changes — the posts are locked reference data (§0.3.1) — so the plan is keyed on it.
 *
 *   2. AN OCCUPIED POST MUST BE UPDATED IN PLACE, NOT REPLACED. `gap_nominations` points at
 *      `role_assignments(id)` under a CHECK requiring exactly one of (assignment, free
 *      text), so deleting a nominated assignment nulls the link and trips the CHECK, taking
 *      the whole revert down with it. Rewriting the occupant columns of the row already on
 *      the post avoids that, and it is also how `moveAssignment` implements a swap — so the
 *      UNIQUE index on `role_id` never sees a collision part-way through.
 */

/** One post's occupant. Occupant columns only: nothing here describes the post itself. */
export interface OccupantFields {
  role_id: number;
  full_name: string | null;
  personal_number: string | null;
  rank: string | null;
  phone: string | null;
  pending_pn: number;
  pending_name: number;
  is_posted: number;
}

/** A post that is occupied right now, as (assignment id, post). */
export interface CurrentAssignment {
  id: number;
  role_id: number;
}

export interface OccupancyRestorePlan<T extends OccupantFields> {
  /** Occupied at snapshot time and occupied now: rewrite the occupant, keep the row. */
  update: { id: number; occupant: T }[];
  /** Occupied now, empty at snapshot time: the assignment goes. */
  remove: number[];
  /** Occupied at snapshot time, empty now: a new assignment on that post. */
  insert: T[];
}

/**
 * Splits a restore into the three operations above.
 *
 * A `current` list holding two rows for one post cannot happen — `role_assignments.role_id`
 * is UNIQUE — but if it somehow did, only the first would be updated and the rest would be
 * removed, which still converges on the snapshot rather than leaving a duplicate behind.
 */
export function planOccupancyRestore<T extends OccupantFields>(
  current: CurrentAssignment[],
  snapshot: T[]
): OccupancyRestorePlan<T> {
  const want = new Map<number, T>();
  for (const occupant of snapshot) want.set(occupant.role_id, occupant);

  const update: { id: number; occupant: T }[] = [];
  const remove: number[] = [];

  for (const row of current) {
    const occupant = want.get(row.role_id);
    if (occupant === undefined) {
      remove.push(row.id);
      continue;
    }
    update.push({ id: row.id, occupant });
    // Claimed, so a second row on the same post falls through to `remove` above and the
    // post is not left with a duplicate.
    want.delete(row.role_id);
  }

  return { update, remove, insert: [...want.values()] };
}
