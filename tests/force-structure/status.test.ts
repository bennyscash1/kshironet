import { describe, it, expect } from "vitest";
import {
  parseAlternatives,
  isDroneRequirement,
  requirementMet,
  missingRequirements,
  computeRoleStatus,
  computeCompanyKpis,
  squadsWithDrone,
  squadKey,
  type RoleStatus,
} from "@/lib/force-structure/status";

/** The nine models seeded in `drone_models`. */
const DRONES = new Set([
  "אווטה",
  "איבו",
  "עטלף",
  "בומרנג",
  "פולו",
  "כדור ברזל",
  "אלפא",
  "פלייקארט",
  "חמשוש",
]);

const noDrone = { squadHasDrone: false };

describe("§5.2 — alternation: 'A / B' is satisfied by either side", () => {
  it("splits on the separator with and without surrounding spaces", () => {
    // Both forms occur in the production data.
    expect(parseAlternatives("נגב 5.56 / נגב 7.62")).toEqual(["נגב 5.56", "נגב 7.62"]);
    expect(parseAlternatives('מ"מ צלפים/צלף')).toEqual(['מ"מ צלפים', "צלף"]);
  });

  it("is satisfied by the first alternative alone", () => {
    expect(
      requirementMet("נגב 5.56 / נגב 7.62", { held: new Set(["נגב 5.56"]), ...noDrone })
    ).toBe(true);
  });

  it("is satisfied by the second alternative alone", () => {
    expect(
      requirementMet("נגב 5.56 / נגב 7.62", { held: new Set(["נגב 7.62"]), ...noDrone })
    ).toBe(true);
  });

  it("is not satisfied by neither", () => {
    expect(
      requirementMet("נגב 5.56 / נגב 7.62", { held: new Set(['מא"ג']), ...noDrone })
    ).toBe(false);
  });

  it("treats a single requirement as an exact match", () => {
    expect(requirementMet("חובש", { held: new Set(["חובש"]), ...noDrone })).toBe(true);
    expect(requirementMet("חובש", { held: new Set(["חבלן"]), ...noDrone })).toBe(false);
  });
});

describe("§5.2 — drone coverage is squad-level, not personal", () => {
  it("recognises the generic drone token but not a specific model name", () => {
    expect(isDroneRequirement("רחפן")).toBe(true);
    expect(isDroneRequirement("רחפנים")).toBe(true);
    expect(isDroneRequirement("איבו")).toBe(false);
  });

  it("satisfies the drone requirement for a soldier who holds NO drone, when a squadmate does", () => {
    expect(requirementMet("רחפן", { held: new Set(["טילן"]), squadHasDrone: true })).toBe(true);
  });

  it("leaves the drone requirement unmet when nobody in the squad holds one", () => {
    expect(requirementMet("רחפן", { held: new Set(["טילן"]), squadHasDrone: false })).toBe(false);
  });

  it("marks a squad covered when any member holds any of the nine models", () => {
    const covered = squadsWithDrone(
      [
        { companyId: 1, department: "מחלקת חוד", squad: "כיתה א'", heldCertifications: ["אלפא"] },
        { companyId: 1, department: "מחלקת חוד", squad: "כיתה א'", heldCertifications: ["טילן"] },
        { companyId: 1, department: "מחלקת חוד", squad: "כיתה ב'", heldCertifications: ["טילן"] },
      ],
      DRONES
    );
    expect(covered.has(squadKey(1, "מחלקת חוד", "כיתה א'"))).toBe(true);
    expect(covered.has(squadKey(1, "מחלקת חוד", "כיתה ב'"))).toBe(false);
  });

  it("does not leak coverage between two squads of the same name in different departments", () => {
    const covered = squadsWithDrone(
      [
        { companyId: 1, department: "מחלקת חוד", squad: "כיתה א'", heldCertifications: ["איבו"] },
        { companyId: 1, department: "מחלקת אש", squad: "כיתה א'", heldCertifications: ["טילן"] },
      ],
      DRONES
    );
    expect(covered.has(squadKey(1, "מחלקת חוד", "כיתה א'"))).toBe(true);
    expect(covered.has(squadKey(1, "מחלקת אש", "כיתה א'"))).toBe(false);
  });

  it("does not leak coverage between companies", () => {
    const covered = squadsWithDrone(
      [{ companyId: 1, department: "מחלקת חוד", squad: "כיתה א'", heldCertifications: ["איבו"] }],
      DRONES
    );
    expect(covered.has(squadKey(2, "מחלקת חוד", "כיתה א'"))).toBe(false);
  });

  it("keeps posts with no squad in their own bucket rather than matching every other", () => {
    const covered = squadsWithDrone(
      [{ companyId: 1, department: 'מפל"ג', squad: null, heldCertifications: ["איבו"] }],
      DRONES
    );
    expect(covered.has(squadKey(1, 'מפל"ג', null))).toBe(true);
    expect(covered.has(squadKey(1, 'מפל"ג', "כיתה א'"))).toBe(false);
  });
});

describe("§5.2 — the three post states", () => {
  const role = { req1: "טילן", req2: "רחפן", req3: null };

  it("is 'empty' when nobody holds the post, regardless of requirements", () => {
    expect(computeRoleStatus(role, false, { held: new Set(), squadHasDrone: true })).toBe("empty");
  });

  it("is 'ok' when every requirement is met", () => {
    expect(
      computeRoleStatus(role, true, { held: new Set(["טילן"]), squadHasDrone: true })
    ).toBe("ok");
  });

  it("is 'red' when a manned post is missing a requirement", () => {
    expect(
      computeRoleStatus(role, true, { held: new Set(["טילן"]), squadHasDrone: false })
    ).toBe("red");
  });

  it("is 'ok' for a post with no requirements at all, once manned", () => {
    expect(
      computeRoleStatus({ req1: null, req2: null, req3: null }, true, {
        held: new Set(),
        ...noDrone,
      })
    ).toBe("ok");
  });

  it("names exactly the missing requirements", () => {
    expect(
      missingRequirements(role, { held: new Set(["טילן"]), squadHasDrone: false })
    ).toEqual(["רחפן"]);
    expect(missingRequirements(role, { held: new Set(), squadHasDrone: false })).toEqual([
      "טילן",
      "רחפן",
    ]);
  });

  it("honours the third requirement column the support companies use", () => {
    const supportRole = { req1: 'מ"מ', req2: "צלף", req3: "מאתר" };
    expect(
      computeRoleStatus(supportRole, true, { held: new Set(['מ"מ', "צלף"]), ...noDrone })
    ).toBe("red");
    expect(
      computeRoleStatus(supportRole, true, {
        held: new Set(['מ"מ', "צלף", "מאתר"]),
        ...noDrone,
      })
    ).toBe("ok");
  });

  it("allows a soldier who does not satisfy the post, and marks it red — this is what feeds the gaps tab", () => {
    // §2.4.1: assigning an unqualified soldier is permitted, not blocked.
    expect(computeRoleStatus(role, true, { held: new Set(), ...noDrone })).toBe("red");
  });
});

describe("§2.4 — manning aligned to the workbook (deliberate deviation from the spec)", () => {
  // 5030 פלוגה א, the company the alignment was calibrated against:
  // 99 posts, 82 manned, 23 of those missing a certification, 1 manned with no identity,
  // 17 empty, and a 120% bank of 14.
  const statuses: RoleStatus[] = [
    ...Array<RoleStatus>(58).fill("ok"),
    ...Array<RoleStatus>(23).fill("red"),
    ...Array<RoleStatus>(1).fill("pending"),
    ...Array<RoleStatus>(17).fill("empty"),
  ];
  const BANK = 14;

  it("reports מאויש 96 and מוכנות 83% — the battalion's own spreadsheet numbers", () => {
    const kpis = computeCompanyKpis(statuses, BANK);
    expect(kpis.establishment).toBe(99);
    expect(kpis.mannedPosts).toBe(82);
    expect(kpis.bank).toBe(BANK);
    // The figure shown as "מאויש": manned posts plus the 120% bank.
    expect(kpis.manned).toBe(96);
    expect(kpis.readinessPct).toBe(83);
  });

  it("does NOT use the spec §2.4 formula, which would read far lower", () => {
    const kpis = computeCompanyKpis(statuses, BANK);
    const specFormula = Math.round(((kpis.mannedPosts - kpis.certificationGap) / kpis.establishment) * 100);
    expect(specFormula).toBe(60);
    expect(kpis.readinessPct).not.toBe(specFormula);
  });

  it("matches the workbook's פער כ\"א of 17", () => {
    expect(computeCompanyKpis(statuses, BANK).manpowerGap).toBe(17);
  });

  it("keeps manpowerGap = establishment − mannedPosts, so the bank cannot close a manning gap", () => {
    const kpis = computeCompanyKpis(statuses, BANK);
    // The identity holds against mannedPosts, NOT against `manned`: the bank is extra
    // people, not filled posts. Asserting it against `manned` would be the bug.
    expect(kpis.establishment - kpis.mannedPosts).toBe(kpis.manpowerGap);
    expect(kpis.establishment - kpis.manned).not.toBe(kpis.manpowerGap);
  });

  it("reports manning and certification gaps as distinct figures, with no combined total", () => {
    const kpis = computeCompanyKpis(statuses, BANK);
    expect(kpis.certificationGap).toBe(23);
    expect(kpis.manpowerGap).toBe(17);
    expect(kpis).not.toHaveProperty("totalGap");
  });

  it("counts a pending-identity post as manned but never as a certification gap", () => {
    const kpis = computeCompanyKpis(statuses, BANK);
    expect(kpis.pendingIdentity).toBe(1);
    // It is inside mannedPosts...
    expect(kpis.mannedPosts).toBe(58 + 23 + 1);
    // ...and outside certificationGap, because what that person holds is unknown and
    // treating unknown as missing would overstate the gap.
    expect(kpis.certificationGap).toBe(23);
  });

  it("defaults the bank to zero so a caller that has not loaded it cannot silently inflate manning", () => {
    expect(computeCompanyKpis(statuses).manned).toBe(82);
  });

  it("handles a company with no posts without dividing by zero", () => {
    expect(computeCompanyKpis([]).readinessPct).toBe(0);
  });
});

describe("pending identity — counted, but not usable", () => {
  const role = { req1: "חובש", req2: null, req3: null };

  it("is 'pending', not 'red', when the occupant has no recorded identity", () => {
    expect(
      computeRoleStatus(role, true, { held: new Set(), squadHasDrone: false, pendingIdentity: true })
    ).toBe("pending");
  });

  it("is still 'empty' when the post is not manned at all, pending or otherwise", () => {
    expect(
      computeRoleStatus(role, false, { held: new Set(), squadHasDrone: false, pendingIdentity: true })
    ).toBe("empty");
  });

  it("falls through to the normal rules once an identity exists", () => {
    expect(
      computeRoleStatus(role, true, { held: new Set(["חובש"]), squadHasDrone: false, pendingIdentity: false })
    ).toBe("ok");
    expect(
      computeRoleStatus(role, true, { held: new Set(), squadHasDrone: false })
    ).toBe("red");
  });
});
