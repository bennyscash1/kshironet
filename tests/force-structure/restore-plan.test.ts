import { describe, it, expect } from "vitest";
import {
  planOccupancyRestore,
  type CurrentAssignment,
  type OccupantFields,
} from "@/lib/force-structure/restore-plan";

/**
 * "חזור" — reverting an edit session on the canvas.
 *
 * The canvas commits every drag as it happens, so cancelling means writing the pre-session
 * occupancy back. This suite covers the decision of HOW, which is where the damage would
 * be: a revert that replaces rows instead of rewriting them takes `gap_nominations` down
 * with it, and a revert that matches on assignment id silently misses every soldier who
 * passed through the 120% bank, because that move deletes and re-inserts the row.
 */

function occupant(role_id: number, name: string, extra: Partial<OccupantFields> = {}): OccupantFields {
  return {
    role_id,
    full_name: name,
    personal_number: `PN-${name}`,
    rank: null,
    phone: null,
    pending_pn: 0,
    pending_name: 0,
    is_posted: 1,
    ...extra,
  };
}

const at = (id: number, role_id: number): CurrentAssignment => ({ id, role_id });

describe("planOccupancyRestore — matching the snapshot to the present", () => {
  it("does nothing when nothing moved", () => {
    const snapshot = [occupant(10, "אלון"), occupant(11, "בר")];
    const plan = planOccupancyRestore([at(1, 10), at(2, 11)], snapshot);

    // Both posts are still occupied, so both are UPDATEs — cheap, and the ids survive.
    expect(plan.remove).toEqual([]);
    expect(plan.insert).toEqual([]);
    expect(plan.update.map((u) => u.id)).toEqual([1, 2]);
  });

  it("rewrites in place rather than replacing, so nominations survive", () => {
    // The two occupants were swapped during the session. `moveAssignment` does a swap by
    // exchanging occupant columns, so the ids are still on their original posts.
    const snapshot = [occupant(10, "אלון"), occupant(11, "בר")];
    const plan = planOccupancyRestore([at(1, 10), at(2, 11)], snapshot);

    expect(plan.remove).toEqual([]);
    expect(plan.insert).toEqual([]);
    // Row 1 gets post 10's original occupant back, row 2 gets post 11's.
    expect(plan.update).toEqual([
      { id: 1, occupant: snapshot[0] },
      { id: 2, occupant: snapshot[1] },
    ]);
  });

  it("removes an assignment that did not exist when the session opened", () => {
    // Post 11 was empty at snapshot time; the user pulled someone out of the bank onto it.
    const plan = planOccupancyRestore([at(1, 10), at(9, 11)], [occupant(10, "אלון")]);

    expect(plan.remove).toEqual([9]);
    expect(plan.update.map((u) => u.id)).toEqual([1]);
    expect(plan.insert).toEqual([]);
  });

  it("re-creates an assignment whose row was deleted by a move to the bank", () => {
    // Post 11's occupant went to the bank, which DELETEd the assignment. There is no id to
    // update, so the plan has to insert — matching on assignment id would have missed this.
    const snapshot = [occupant(10, "אלון"), occupant(11, "בר")];
    const plan = planOccupancyRestore([at(1, 10)], snapshot);

    expect(plan.remove).toEqual([]);
    expect(plan.update.map((u) => u.id)).toEqual([1]);
    expect(plan.insert).toEqual([snapshot[1]]);
  });

  it("ignores the assignment ids the session started with", () => {
    // Same occupancy as the snapshot describes, but every row has been re-created with a
    // different id. Keyed on role_id, the plan still recognises it as unchanged occupancy.
    const snapshot = [occupant(10, "אלון"), occupant(11, "בר")];
    const plan = planOccupancyRestore([at(101, 11), at(102, 10)], snapshot);

    expect(plan.remove).toEqual([]);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([
      { id: 101, occupant: snapshot[1] },
      { id: 102, occupant: snapshot[0] },
    ]);
  });

  it("empties the battalion when the session opened with nobody posted", () => {
    const plan = planOccupancyRestore([at(1, 10), at(2, 11), at(3, 12)], []);

    expect(plan.remove).toEqual([1, 2, 3]);
    expect(plan.update).toEqual([]);
    expect(plan.insert).toEqual([]);
  });

  it("carries the pending-identity and posting flags back verbatim", () => {
    // §019: a post can be manned with no name, or hold a name while not posted. A revert
    // that normalised these would change the battalion's own manning count.
    const pending = occupant(10, "x", {
      full_name: null,
      personal_number: null,
      pending_pn: 1,
      pending_name: 1,
      is_posted: 1,
    });
    const notPosted = occupant(11, "בר", { is_posted: 0 });
    const plan = planOccupancyRestore([at(1, 10)], [pending, notPosted]);

    expect(plan.update[0].occupant).toEqual(pending);
    expect(plan.insert).toEqual([notPosted]);
  });

  it("converges on the snapshot even if a post somehow holds two assignments", () => {
    // role_id is UNIQUE so this cannot arise; the assertion is that the plan does not leave
    // a duplicate behind if it ever did.
    const snapshot = [occupant(10, "אלון")];
    const plan = planOccupancyRestore([at(1, 10), at(2, 10)], snapshot);

    expect(plan.update).toEqual([{ id: 1, occupant: snapshot[0] }]);
    expect(plan.remove).toEqual([2]);
    expect(plan.insert).toEqual([]);
  });
});
