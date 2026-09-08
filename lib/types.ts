export type CertificationStatus =
  | "draft"
  | "open"
  | "full"
  | "closed"
  | "in_progress"
  | "completed"
  | "cancelled";

export const CERTIFICATION_STATUSES: CertificationStatus[] = [
  "draft",
  "open",
  "full",
  "closed",
  "in_progress",
  "completed",
  "cancelled",
];

export const CERTIFICATION_STATUS_LABELS: Record<CertificationStatus, string> = {
  draft: "טיוטה",
  open: "פתוחה להרשמה",
  full: "מלאה",
  closed: "סגורה להרשמה",
  in_progress: "בביצוע",
  completed: "בוצעה",
  cancelled: "בוטלה",
};

export type RosterStatus =
  | "registered"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "participated"
  | "did_not_participate"
  | "did_not_report"
  | "passed"
  | "failed";

export const ROSTER_STATUSES: RosterStatus[] = [
  "registered",
  "pending_approval",
  "approved",
  "rejected",
  "participated",
  "did_not_participate",
  "did_not_report",
  "passed",
  "failed",
];

export const ROSTER_STATUS_LABELS: Record<RosterStatus, string> = {
  registered: "נרשם",
  pending_approval: "ממתין לאישור",
  approved: "אושר",
  rejected: "נדחה",
  participated: "השתתף",
  did_not_participate: "לא השתתף",
  did_not_report: "לא התייצב",
  passed: "עבר הסמכה",
  failed: "לא עבר הסמכה",
};

export type RequestStatus =
  | "opened"
  | "in_review"
  | "approved"
  | "rejected"
  | "certification_opened"
  | "closed";

export const REQUEST_STATUSES: RequestStatus[] = [
  "opened",
  "in_review",
  "approved",
  "rejected",
  "certification_opened",
  "closed",
];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  opened: "נפתחה",
  in_review: "בטיפול חטיבה",
  approved: "אושרה",
  rejected: "נדחתה",
  certification_opened: "הסמכה נפתחה בהתאם לדרישה",
  closed: "נסגרה",
};

export type Urgency = "low" | "normal" | "high" | "urgent";

export const URGENCY_LEVELS: Urgency[] = ["low", "normal", "high", "urgent"];

export const URGENCY_LABELS: Record<Urgency, string> = {
  low: "נמוכה",
  normal: "רגילה",
  high: "גבוהה",
  urgent: "דחוף",
};

export type EntityType = "certification" | "battalion_request" | "roster_entry";

export type Role = "brigade" | `battalion:${string}`;

// --- Real per-user authorization (Supabase auth id -> app role/status) ---

/** `super_admin` / `editor` / `viewer` are GLOBAL (system-wide) and unchanged.
 * `viewer_battalion` / `editor_battalion` are scoped to the user's `battalion_id`. */
export type UserRole =
  | "super_admin"
  | "editor"
  | "viewer"
  | "viewer_battalion"
  | "editor_battalion";

export const USER_ROLES: UserRole[] = [
  "super_admin",
  "editor",
  "viewer",
  "viewer_battalion",
  "editor_battalion",
];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "מנהל על",
  editor: "עורך",
  viewer: "צפייה בלבד",
  viewer_battalion: "צפייה גדודי",
  editor_battalion: "עריכה גדודי",
};

/** The two roles limited to a single battalion. Everything else is system-wide. */
export const BATTALION_SCOPED_ROLES: UserRole[] = ["viewer_battalion", "editor_battalion"];

export type UserStatus = "pending" | "approved" | "rejected";

export const USER_STATUSES: UserStatus[] = ["pending", "approved", "rejected"];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  pending: "ממתין לאישור",
  approved: "מאושר",
  rejected: "נדחה",
};

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  /** Set only for the battalion-scoped roles; NULL for every global role. */
  battalion_id: number | null;
  /** Free text the user typed at signup. Indication for the admin only — NEVER
   * consulted for authorization. */
  requested_role_text: string | null;
  requested_battalion_text: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface Battalion {
  id: number;
  code: string;
  name: string;
  color_hex: string;
  is_active: number;
}

export interface CertificationTemplate {
  id: number;
  name: string;
  domain: string | null;
  default_location: string | null;
  default_slots: number | null;
  default_notes: string | null;
  gap_row_id: number | null;
  checkin_details: string | null;
  duration_text: string | null;
  trainee_ratio: string | null;
  ammo_required: string | null;
  requirements_text: string | null;
  equipment_text: string | null;
  contacts_text: string | null;
  color_hex: string | null;
  created_at: string;
  updated_at: string;
}

export interface Certification {
  id: number;
  template_id: number | null;
  name: string;
  domain: string | null;
  start_date: string;
  end_date: string | null;
  location: string | null;
  total_slots: number | null;
  registration_open: number;
  /** Last day on which trainees may be registered, as 'yyyy-MM-dd'. NULL = no deadline.
   * ONE date for the whole certification — it applies to every battalion's allocation
   * alike. See lib/utils/registration-lock.ts. */
  registration_lock_date: string | null;
  /** The closing HOUR on that date, 0–23 Israel wall-clock, whole hours only
   * (migration 022). NULL = end of the lock day, which is the pre-022 meaning. Never read
   * this without the date — `lockMoment()` in lib/utils/registration-lock.ts combines the
   * two, including the DST handling. */
  registration_lock_hour: number | null;
  status: CertificationStatus;
  notes: string | null;
  origin_request_id: number | null;
  gap_row_id: number | null;
  created_by_role: string;
  color_hex: string | null;
  created_at: string;
  updated_at: string;
}

export interface CertificationWithCounts extends Certification {
  registered_count: number;
  slots_remaining: number | null;
}

export interface CertificationPrerequisite {
  id: number;
  certification_id: number;
  description: string;
}

export interface CertificationTax {
  id: number;
  certification_id: number;
  role_name: string;
  is_fulfilled: number;
  notes: string | null;
}

export interface CertificationBattalionQuota {
  id: number;
  certification_id: number;
  battalion_id: number;
  allocated_slots: number;
  notes: string | null;
  /** DEPRECATED — the per-allocation deadline from migration 008. Superseded by
   * `certifications.registration_lock_date`, which applies to every battalion at once.
   * The column is retained so the deadlines already recorded against it are not lost, but
   * nothing enforces or edits it any more. */
  registration_lock_at: string | null;
}

/** Metadata for a file attached to a certification. The bytes live in the private
 * Supabase Storage bucket (see lib/storage/certification-files.ts) at
 * `storage_path`; only this row lives in Postgres. */
export interface CertificationFile {
  id: number;
  certification_id: number;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  /** Supabase auth user id of the uploader. */
  uploaded_by: string | null;
  created_at: string;
}

/** A file row plus a signed URL generated for the current request. Signed URLs are
 * short-lived and never persisted. */
export interface CertificationFileWithUrl extends CertificationFile {
  signed_url: string | null;
}

/** Saved configuration of a "פילוח הסמכות" report widget. Stored as jsonb; the counts
 * are always recomputed live, never persisted. */
export interface PivotWidgetConfig {
  battalionIds: number[];
  certificationIds: number[];
  fromDate: string;
  toDate?: string | null;
}

/** A saved pivot widget row. Global — visible to every viewer regardless of
 * `created_by`, which is provenance only. */
export interface SavedPivotWidget {
  id: string;
  name: string;
  config: PivotWidgetConfig;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterEntry {
  id: number;
  /** NULL for a request-stage soldier: attached to a request before any
   * certification exists (see `battalion_request_id`). */
  certification_id: number | null;
  /** Set when the soldier was attached to a certification request. */
  battalion_request_id: number | null;
  battalion_id: number;
  full_name: string;
  personal_number: string;
  company_platoon: string | null;
  phone: string | null;
  commander_name: string | null;
  commander_phone: string | null;
  has_prior_certification: number;
  prior_certification_details: string | null;
  /** "נדרש לינה" — informational only. SMALLINT 0/1, like every other flag on this row. */
  requires_lodging: number;
  meets_prerequisite: number | null;
  notes: string | null;
  status: RosterStatus;
  outcome_reason: string | null;
  is_reserve: number;
  created_at: string;
  updated_at: string;
}

export interface BattalionRequest {
  id: number;
  battalion_id: number;
  requested_cert_type: string;
  quantity_needed: number;
  reason: string | null;
  urgency: Urgency;
  desired_date: string | null;
  notes: string | null;
  status: RequestStatus;
  linked_certification_id: number | null;
  created_at: string;
  updated_at: string;
}

/** A soldier a battalion designated on a request. On opening a certification from
 * the request, these become reserve roster entries (is_reserve = 1). */
export interface BattalionRequestSoldier {
  id: number;
  request_id: number;
  full_name: string;
  personal_number: string | null;
  phone: string | null;
  battalion_id: number | null;
  created_at: string;
}

export interface StatusHistoryEntry {
  id: number;
  entity_type: EntityType;
  entity_id: number;
  old_status: string | null;
  new_status: string;
  changed_by_role: string;
  note: string | null;
  changed_at: string;
}

export interface Training {
  id: number;
  name: string;
  domain: string | null;
  start_date: string;
  end_date: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  color_hex: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingWithCounts extends Training {
  session_count: number;
  unit_count: number;
}

export interface TrainingSession {
  id: number;
  training_id: number;
  battalion_id: number;
  session_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  instructor_name: string | null;
  instructor_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfluencingFactor {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationType =
  | "certification_opened"
  | "opened_from_request"
  | "soldier_added"
  | "date_approaching"
  | "registration_closed"
  | "soldier_approved"
  | "soldier_rejected"
  | "certification_cancelled"
  | "certification_changed"
  | "user_registered";

export interface Notification {
  id: number;
  type: NotificationType;
  target_role: string;
  entity_type: EntityType | null;
  entity_id: number | null;
  message: string;
  is_read: number;
  created_at: string;
}
