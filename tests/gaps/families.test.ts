import { describe, expect, it } from "vitest";
import {
  displayFamilyForGap,
  matchFamilyByDomain,
  syntheticFamilyId,
} from "@/lib/gaps/families";
import type { CertificationFamily } from "@/lib/gaps/types";

const FAMILIES: CertificationFamily[] = [
  { id: 1, name: "רחפנים", ink: "#0b7a4b", line: "#8fd9b6", bg: "#eaf7f0", sort_order: 1 },
  { id: 2, name: "נהיגה וניוד", ink: "#1d4ed8", line: "#a5bcf5", bg: "#ecf1fe", sort_order: 2 },
];

describe("gap families from template domain", () => {
  it("maps אווטה's domain רחפנים to the drones family", () => {
    expect(matchFamilyByDomain("רחפנים", FAMILIES)?.id).toBe(1);
  });

  it("maps האמר's domain נהיגה onto נהיגה וניוד", () => {
    expect(matchFamilyByDomain("נהיגה", FAMILIES)?.name).toBe("נהיגה וניוד");
  });

  it("prefers a stored family_id when it is still in the table", () => {
    expect(displayFamilyForGap(2, "רחפנים", FAMILIES)?.id).toBe(2);
  });

  it("falls back to the template domain when family_id is empty", () => {
    expect(displayFamilyForGap(null, "רחפנים", FAMILIES)?.id).toBe(1);
  });

  it("keeps an unmatched domain (פק\"לים) as its own group", () => {
    const fam = displayFamilyForGap(null, 'פק"לים', FAMILIES);
    expect(fam?.name).toBe('פק"לים');
    expect(fam?.id).toBe(syntheticFamilyId('פק"לים'));
    expect(fam!.id).toBeLessThan(0);
  });

  it("leaves a row with no domain ungrouped", () => {
    expect(displayFamilyForGap(null, null, FAMILIES)).toBeNull();
  });
});
