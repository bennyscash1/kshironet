import { describe, expect, it } from "vitest";
import {
  SOLDIER_BLOCK_SEPARATOR,
  formatSoldierBlock,
  formatSoldierBlocks,
  rosterEntryToCopyInput,
  type SoldierCopyInput,
} from "@/lib/roster/copy-format";
import { battalionLabel, battalionShortLabel, NO_BATTALION_LABEL } from "@/lib/battalions/label";
import type { Battalion, RosterEntry } from "@/lib/types";

/**
 * The pasted WhatsApp block. This suite exists because the format is a contract with
 * whoever receives the message, not an internal detail: a stray space or a dropped
 * invisible character is invisible in review and obvious to the recipient.
 */

const WORD_JOINER = String.fromCharCode(0x2060);

/** The sample supplied with the request, reproduced here as the expected output. */
const SAMPLE = [
  "*עטלף*",
  "מ.א: 8780046",
  "שם מלא: שליו בן צור",
  `${WORD_JOINER}מספר טלפון: 0549214985`,
  "ת״ז 322377888",
  "מילואים/ סדיר- מילואים",
  "פיקוד - פצן",
  "אוגדה- 146",
  "חטיבה- 228",
  "גדוד- 5030",
].join("\n");

const sampleInput: SoldierCopyInput = {
  certificationName: "עטלף",
  personalNumber: "8780046",
  fullName: "שליו בן צור",
  phone: "0549214985",
  // Neither of these is a column today; they are supplied here purely to prove the
  // formatter renders the sample exactly when values do exist.
  nationalId: "322377888",
  serviceType: "מילואים",
  battalionLabel: "5030",
};

describe("formatSoldierBlock", () => {
  it("reproduces the supplied sample character-for-character", () => {
    expect(formatSoldierBlock(sampleInput)).toBe(SAMPLE);
  });

  it("keeps the invisible word joiner before the phone label", () => {
    // The one character nobody can see in a diff, so it gets its own assertion.
    const line = formatSoldierBlock(sampleInput).split("\n")[3];
    expect(line.codePointAt(0)).toBe(0x2060);
    expect(line).toBe(`${WORD_JOINER}מספר טלפון: 0549214985`);
  });

  it("uses a colon for מ.א and שם מלא but a bare space for ת״ז", () => {
    // Straight from the sample; the inconsistency is intentional and easy to "fix" by
    // accident.
    const lines = formatSoldierBlock(sampleInput).split("\n");
    expect(lines[1].startsWith("מ.א: ")).toBe(true);
    expect(lines[2].startsWith("שם מלא: ")).toBe(true);
    expect(lines[4].startsWith("ת״ז ")).toBe(true);
    expect(lines[4]).not.toContain(":");
  });

  it("emits the fixed chain-of-command lines verbatim", () => {
    const lines = formatSoldierBlock(sampleInput).split("\n");
    expect(lines[6]).toBe("פיקוד - פצן");
    expect(lines[7]).toBe("אוגדה- 146");
    expect(lines[8]).toBe("חטיבה- 228");
  });

  it("leaves the label in place with nothing after it when a value is missing", () => {
    // ת״ז and service type have no column in roster_entries, so this is the real-world
    // shape of every block the app produces today.
    const lines = formatSoldierBlock({
      certificationName: "עטלף",
      personalNumber: null,
      fullName: "שליו בן צור",
      phone: null,
      battalionLabel: null,
    }).split("\n");
    expect(lines[1]).toBe("מ.א: ");
    expect(lines[3]).toBe(`${WORD_JOINER}מספר טלפון: `);
    expect(lines[4]).toBe("ת״ז ");
    expect(lines[5]).toBe("מילואים/ סדיר- ");
    expect(lines[9]).toBe("גדוד- ");
    // Still ten lines: a missing value must not collapse its line.
    expect(lines).toHaveLength(10);
  });

  it("wraps the certification name in literal asterisks for WhatsApp bold", () => {
    expect(formatSoldierBlock(sampleInput).split("\n")[0]).toBe("*עטלף*");
  });

  it("carries no separator on its own", () => {
    expect(formatSoldierBlock(sampleInput)).not.toContain("---");
  });
});

describe("formatSoldierBlocks", () => {
  const b = (name: string): SoldierCopyInput => ({ ...sampleInput, fullName: name });

  it("joins blocks with a blank line, --- and another blank line", () => {
    expect(SOLDIER_BLOCK_SEPARATOR).toBe("\n\n---\n\n");
    const text = formatSoldierBlocks([b("א"), b("ב"), b("ג")]);
    expect(text.split("\n\n---\n\n")).toHaveLength(3);
    // No leading or trailing rule — the separator goes strictly between soldiers.
    expect(text.startsWith("*עטלף*")).toBe(true);
    expect(text.endsWith("גדוד- 5030")).toBe(true);
  });

  it("produces exactly the single block when given one soldier", () => {
    // The per-row button and a one-row table must agree byte for byte.
    expect(formatSoldierBlocks([sampleInput])).toBe(formatSoldierBlock(sampleInput));
  });

  it("returns an empty string for no soldiers", () => {
    expect(formatSoldierBlocks([])).toBe("");
  });
});

describe("rosterEntryToCopyInput", () => {
  const entry = {
    id: 1,
    certification_id: 7,
    battalion_request_id: null,
    battalion_id: 3,
    full_name: "שליו בן צור",
    personal_number: "8780046",
    company_platoon: "א/2",
    phone: "0549214985",
    commander_name: null,
    commander_phone: null,
    has_prior_certification: 0,
    prior_certification_details: null,
    meets_prerequisite: null,
    notes: null,
    status: "registered",
    outcome_reason: null,
    is_reserve: 1,
    created_at: "",
    updated_at: "",
  } as RosterEntry;

  const battalion = { id: 3, code: "5030", name: "גדוד 5030", color_hex: "#000", is_active: 1 } as Battalion;
  // The real row from the database, ASCII quote and all — see lib/battalions/label.ts.
  const gdsm = { id: 5, code: "gdsm", name: 'גדס"מ', color_hex: "#000", is_active: 1 } as Battalion;

  it("drops the redundant גדוד prefix from a numbered battalion's name", () => {
    // The block prints its own "גדוד- ", so the name "גדוד 5030" must arrive as "5030" —
    // the output the units already receive.
    expect(rosterEntryToCopyInput(entry, "עטלף", battalion).battalionLabel).toBe("5030");
  });

  it("emits the Hebrew NAME for a non-numeric battalion, never its Latin code", () => {
    // The bug: `battalion.code` is the slug "gdsm", which pasted as "גדוד- gdsm".
    const input = rosterEntryToCopyInput(entry, "עטלף", gdsm);
    expect(input.battalionLabel).toBe('גדס"מ');
    expect(formatSoldierBlock(input).split("\n")[9]).toBe('גדוד- גדס"מ');
  });

  it("puts no Latin character anywhere in a non-numeric battalion's block", () => {
    const text = formatSoldierBlock({
      ...rosterEntryToCopyInput(entry, "עטלף", gdsm),
      certificationName: "עטלף",
    });
    expect(text).not.toMatch(/[A-Za-z]/);
  });

  it("agrees with what the roster table cell renders", () => {
    // The two surfaces differ by exactly the "גדוד " prefix the block supplies itself, so
    // one resolver feeds both and they cannot drift apart again.
    for (const b of [battalion, gdsm]) {
      const cell = battalionLabel(b, "-");
      const copied = rosterEntryToCopyInput(entry, "עטלף", b).battalionLabel;
      expect(cell.endsWith(copied!)).toBe(true);
    }
  });

  it("never derives the service type from is_reserve", () => {
    // is_reserve means עתודה for this certification — a different concept from
    // מילואים/סדיר. Reading one as the other would put confident, wrong data in a message.
    const input = rosterEntryToCopyInput(entry, "עטלף", battalion);
    expect(input.serviceType).toBeUndefined();
    expect(formatSoldierBlock(input).split("\n")[5]).toBe("מילואים/ סדיר- ");
  });

  it("leaves the גדוד line empty for a battalion that is not in the map", () => {
    // Empty, not "ללא גדוד": every other missing value in this block renders as a bare
    // label, and the pasted text must keep that shape.
    const input = rosterEntryToCopyInput(entry, "עטלף", undefined);
    expect(input.battalionLabel).toBe("");
    expect(formatSoldierBlock(input).split("\n")[9]).toBe("גדוד- ");
  });
});

describe("battalionLabel / battalionShortLabel — the shared resolver", () => {
  const numbered = { name: "גדוד 5030", code: "5030" };
  const named = { name: 'גדס"מ', code: "gdsm" };

  it("prefers the display name over the code", () => {
    expect(battalionLabel(numbered)).toBe("גדוד 5030");
    expect(battalionLabel(named)).toBe('גדס"מ');
  });

  it("falls back name → code → placeholder, never to an id", () => {
    expect(battalionLabel({ name: null, code: "gdsm" })).toBe("gdsm");
    expect(battalionLabel({ name: "  ", code: "  " })).toBe(NO_BATTALION_LABEL);
    expect(battalionLabel(null)).toBe(NO_BATTALION_LABEL);
    expect(battalionLabel(undefined)).toBe(NO_BATTALION_LABEL);
    // @ts-expect-error — an id must never satisfy the label shape.
    expect(battalionLabel({ id: 3 })).toBe(NO_BATTALION_LABEL);
  });

  it("strips the גדוד prefix only where there is one", () => {
    expect(battalionShortLabel(numbered)).toBe("5030");
    expect(battalionShortLabel(named)).toBe('גדס"מ');
    expect(battalionShortLabel({ name: "מפח\"ט", code: "hq" })).toBe('מפח"ט');
  });

  it("does not collapse a name that is exactly גדוד", () => {
    expect(battalionShortLabel({ name: "גדוד", code: "x" })).toBe("גדוד");
    expect(battalionShortLabel({ name: "גדוד   ", code: "x" })).toBe("גדוד");
  });

  it("honours a caller-supplied fallback", () => {
    expect(battalionLabel(null, "-")).toBe("-");
    expect(battalionShortLabel(undefined, "")).toBe("");
  });

  it("preserves the database's ASCII quote rather than normalising it", () => {
    // The table and the paste must match character-for-character; U+05F4 would not.
    expect(battalionLabel(named)).toContain(String.fromCharCode(0x22));
    expect(battalionLabel(named)).not.toContain(String.fromCharCode(0x05f4));
  });
});
