import type {
  CertificationStatus,
  CertificationWithCounts,
  InfluencingFactor,
  Training,
} from "@/lib/types";
import { certificationColor } from "@/lib/utils/cert-colors";

/** Influencing factors are always this fixed gray — never the per-course color. */
export const INFLUENCING_FACTOR_COLOR = "#6b7280";

/** Sort priority for calendar bars: influencing factors first (top), then the rest.
 * Lower sorts earlier / higher on screen. */
export function calendarSortPriority(kind: CalendarItemKind): number {
  return kind === "influencing_factor" ? 0 : 1;
}

/** Comparator that pins influencing factors to the top, then orders by start date. */
export function compareCalendarItems(a: CalendarItem, b: CalendarItem): number {
  const p = calendarSortPriority(a.kind) - calendarSortPriority(b.kind);
  if (p !== 0) return p;
  return a.start_date.localeCompare(b.start_date);
}

export type CalendarBattalionRef = {
  code: string;
  name: string;
  color_hex: string;
};

export type CalendarItemKind = "certification" | "training" | "influencing_factor";

/** A single time-bound entity rendered on the calendar. Certifications and trainings
 * are both projected into this unified shape so every view renders a color-coded
 * spanning bar the same way, driven by `kind`. */
export interface CalendarItem {
  kind: CalendarItemKind;
  /** Original entity id (unique only within a kind). */
  id: number;
  /** Stable key unique across kinds — use for React keys and lane maps. */
  key: string;
  name: string;
  start_date: string;
  end_date: string | null;
  location: string | null;
  href: string;
  /** Resolved bar color (the record's color_hex, with a stable per-name fallback). */
  color: string;
  battalions: CalendarBattalionRef[];
  /** 1 when brigade-wide open (always shown under a unit filter); 0 otherwise. */
  registration_open: number;
  // Certification-only extras (undefined for other kinds):
  status?: CertificationStatus;
  registered_count?: number;
  slots_remaining?: number | null;
  total_slots?: number | null;
}

/** Projects a certification (enriched with battalion refs) into a CalendarItem. */
export function certificationToCalendarItem(
  cert: CertificationWithCounts & { battalions: CalendarBattalionRef[] }
): CalendarItem {
  return {
    kind: "certification",
    id: cert.id,
    key: `certification-${cert.id}`,
    name: cert.name,
    start_date: cert.start_date,
    end_date: cert.end_date,
    location: cert.location,
    href: `/certifications/${cert.id}`,
    color: cert.color_hex || certificationColor(cert.name),
    battalions: cert.battalions,
    registration_open: cert.registration_open,
    status: cert.status,
    registered_count: cert.registered_count,
    slots_remaining: cert.slots_remaining,
    total_slots: cert.total_slots,
  };
}

/** Projects a training (with its distinct battalion refs) into a CalendarItem. Trainings
 * carry no status/slots and their location lives per-session, so those fields are omitted. */
export function trainingToCalendarItem(
  training: Training,
  battalions: CalendarBattalionRef[]
): CalendarItem {
  return {
    kind: "training",
    id: training.id,
    key: `training-${training.id}`,
    name: training.name,
    start_date: training.start_date,
    end_date: training.end_date,
    location: null,
    href: `/trainings/${training.id}`,
    color: training.color_hex || certificationColor(training.domain || training.name),
    battalions,
    registration_open: 0,
  };
}

/** Projects an influencing factor into a CalendarItem. Always gray — it does NOT
 * use the per-course color system (no color_hex field, no fallback palette), and
 * single-day factors get the same gray as multi-day ones. */
export function influencingFactorToCalendarItem(
  factor: InfluencingFactor,
  battalions: CalendarBattalionRef[]
): CalendarItem {
  return {
    kind: "influencing_factor",
    id: factor.id,
    key: `influencing_factor-${factor.id}`,
    name: factor.name,
    start_date: factor.start_date,
    end_date: factor.end_date,
    location: null,
    href: `/influencing-factors/${factor.id}`,
    color: INFLUENCING_FACTOR_COLOR,
    battalions,
    registration_open: 0,
  };
}

/** Narrows an item's battalion chips to a single battalion — used for the two
 * battalion-scoped roles, whose calendar and gantt must not name the other units taking
 * part. Global roles never call this, so their items keep every chip. */
export function scopeCalendarItemToBattalion(item: CalendarItem, code: string): CalendarItem {
  return { ...item, battalions: item.battalions.filter((b) => b.code === code) };
}
