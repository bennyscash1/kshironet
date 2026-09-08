import type { GapAggregateRow } from "@/lib/db/repositories/certification-gaps";

/** One request type inside a battalion's card. */
export interface GapTypeEntry {
  request_type_id: number;
  request_type_name: string;
  quantity: number;
}

/** "לפי גדוד": a battalion and every request type it asked for. */
export interface GapBattalionGroup {
  battalion_id: number;
  battalion_name: string;
  battalion_code: string;
  battalion_color: string;
  total: number;
  entries: GapTypeEntry[];
}

/** One battalion inside a request type's card. */
export interface GapBattalionEntry {
  battalion_id: number;
  battalion_name: string;
  battalion_color: string;
  quantity: number;
}

/** "לפי סוג דרישה": a request type and every battalion that asked for it. */
export interface GapRequestTypeGroup {
  request_type_id: number;
  request_type_name: string;
  total: number;
  entries: GapBattalionEntry[];
}

/** Hebrew-aware descending-quantity ordering, ties broken by name. */
function byQuantityThenName<T extends { quantity: number }>(nameOf: (item: T) => string) {
  return (a: T, b: T) =>
    b.quantity - a.quantity || nameOf(a).localeCompare(nameOf(b), "he");
}

/**
 * Folds the flat aggregate into per-battalion cards, biggest battalion first.
 *
 * The aggregate is already zero-free, so every group returned has a positive total and no
 * empty card can come out of this.
 */
export function groupByBattalion(rows: GapAggregateRow[]): GapBattalionGroup[] {
  const groups = new Map<number, GapBattalionGroup>();

  for (const row of rows) {
    let group = groups.get(row.battalion_id);
    if (!group) {
      group = {
        battalion_id: row.battalion_id,
        battalion_name: row.battalion_name,
        battalion_code: row.battalion_code,
        battalion_color: row.battalion_color,
        total: 0,
        entries: [],
      };
      groups.set(row.battalion_id, group);
    }
    group.total += row.quantity;
    group.entries.push({
      request_type_id: row.request_type_id,
      request_type_name: row.request_type_name,
      quantity: row.quantity,
    });
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.entries.sort(byQuantityThenName((e) => e.request_type_name));
  }
  return result.sort(
    (a, b) => b.total - a.total || a.battalion_name.localeCompare(b.battalion_name, "he")
  );
}

/** Folds the same aggregate into per-request-type cards, biggest type first. */
export function groupByRequestType(rows: GapAggregateRow[]): GapRequestTypeGroup[] {
  const groups = new Map<number, GapRequestTypeGroup>();

  for (const row of rows) {
    let group = groups.get(row.request_type_id);
    if (!group) {
      group = {
        request_type_id: row.request_type_id,
        request_type_name: row.request_type_name,
        total: 0,
        entries: [],
      };
      groups.set(row.request_type_id, group);
    }
    group.total += row.quantity;
    group.entries.push({
      battalion_id: row.battalion_id,
      battalion_name: row.battalion_name,
      battalion_color: row.battalion_color,
      quantity: row.quantity,
    });
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.entries.sort(byQuantityThenName((e) => e.battalion_name));
  }
  return result.sort(
    (a, b) =>
      b.total - a.total || a.request_type_name.localeCompare(b.request_type_name, "he")
  );
}
