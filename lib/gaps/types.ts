import type { UnitCounts } from "@/lib/gaps/compute";

export interface CertificationFamily {
  id: number;
  name: string;
  ink: string;
  line: string;
  bg: string;
  sort_order: number;
}

export interface UnitTypeRow {
  code: string;
  name: string;
  unit_count: number;
  unit_count_source: string;
}

export interface GapKeyLine {
  id: number;
  gap_row_id: number;
  source: "operational" | "establishment";
  qty: number;
  unit_type: string;
  sort_order: number;
}

export interface ComputedGapRow {
  gap_row_id: number;
  certification_name: string;
  canonical_cert_name: string;
  family_id: number | null;
  /** תחום from the templates bank (and certifications), used to group when family_id is empty. */
  template_domain: string | null;
  active_source: "operational" | "establishment";
  required_count: number;
  held_count: number;
  gap_count: number;
  surplus_count: number;
  gap_state: "gap" | "balanced" | "surplus";
  manual_gap_count: number | null;
  key_line_count: number;
}

export function unitCountsMap(rows: UnitTypeRow[]): UnitCounts {
  const map: UnitCounts = {};
  for (const r of rows) map[r.code] = r.unit_count;
  return map;
}

export function unitNamesMap(rows: UnitTypeRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows) map[r.code] = r.name;
  return map;
}
