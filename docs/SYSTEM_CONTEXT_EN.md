# Kshironet (כשירונט) — System Context Document

This document was produced by reading the code only (read-only audit). Every claim is tagged
with the file it came from. Where existing documentation (`PROJECT_OVERVIEW.md`, `README.md`)
disagrees with the code — **the code wins**, and the discrepancy is called out explicitly.
Anything that could not be determined from the code is marked under "Needs verification".

Technical identifiers (table names, columns, paths, functions, role strings, enum values)
appear in English exactly as they are in the code. Hebrew domain terms are given in the
original with an English gloss on first use.

---

## 1. Overview

An internal system for managing **certifications and courses** at brigade level (Brigade 228).
It centralizes the full lifecycle: a battalion's request for a course, opening a certification,
allocating seats to battalions, assigning soldiers, tracking remaining seats, locking
registration, confirming who passed, and computing certification gaps against the force structure.

The name and slogan are defined in one place: `lib/config/app.ts` — `APP_NAME = "כשירונט"`,
`APP_SLOGAN = "כשירות בזמן אמת"`, `APP_NAME_EN = "Kshironet"`, `BRIGADE_LABEL = "228"`.

The entire UI is Hebrew RTL (`app/layout.tsx`: `<html lang="he" dir="rtl">`, Heebo font,
`Direction.DirectionProvider dir="rtl"` from radix-ui).

### The two permission axes — critical to understanding the system

The code separates **two independent axes**, and this is the central point of confusion in
the system:

| Axis | Source | Kind | Values |
|---|---|---|---|
| **Real privilege** | `users` table, via the authenticated Supabase session | Authoritative | `super_admin`, `editor`, `viewer`, `viewer_battalion`, `editor_battalion` |
| **View scope** | Cookie named `active_role` | **View selector only — spoofable** | `brigade` or `battalion:<code>` |

`lib/types.ts:110` defines `UserRole` — the five real roles. `lib/types.ts:104` defines
``Role = "brigade" | `battalion:${string}` `` — the view axis.

`lib/auth/permissions.ts` documents this explicitly: functions taking `AppUser` are "the
authoritative gate"; functions taking `Role` are "a view-scope selector". The cookie name
lives in `lib/auth/constants.ts`.

**`POST /api/role` (`app/api/role/route.ts`) sets the cookie with no authorization check
whatsoever** — any request can set `active_role` to any valid value. This is why every route
that authorizes off the cookie is considered insecure (section 5).

### Effective user tiers

| Role | Read | Write | Scope |
|---|---|---|---|
| `super_admin` | Everything | Everything + user management | Whole brigade |
| `editor` | Everything | Everything except user management | Whole brigade |
| `viewer` | Everything | None | Whole brigade |
| `editor_battalion` | Own battalion | Own battalion only | `users.battalion_id` |
| `viewer_battalion` | Own battalion | None | `users.battalion_id` |

User states (`lib/types.ts:136`): `pending`, `approved`, `rejected`. A user who is not
`approved` is routed to `/pending` (`proxy.ts`).

**Documentation gap:** `PROJECT_OVERVIEW.md` describes "two kinds of users" — brigade and
battalion — and presents the role switcher as the permission mechanism. **The code defines
five real roles** in the `users` table, and the role switcher is a view selector only. The
documentation is stale.

### Deployment target

Vercel, region `dub1` (`vercel.json`). Database: Supabase Postgres via `pg` directly
(no ORM). Auth: Supabase Auth. Files: Supabase Storage, private bucket `certification-files`.

---

## 2. Tech stack (verified)

From `package.json`:

| Package | Version |
|---|---|
| `next` | `16.2.10` |
| `react` / `react-dom` | `19.2.4` |
| `typescript` | `^5` |
| `zod` | `^4.4.3` |
| `pg` | `^8.22.0` |
| `@supabase/ssr` | `^0.12.3` |
| `@supabase/supabase-js` | `^2.110.7` |
| `tailwindcss` | `^4` (+ `@tailwindcss/postcss ^4`) |
| `radix-ui` | `^1.6.1` |
| `lucide-react` | `^1.23.0` |
| `react-hook-form` | `^7.80.0` |
| `@hookform/resolvers` | `^5.4.0` |
| `date-fns` | `^4.4.0` |
| `xlsx` | `^0.18.5` |
| `jspdf` | `^4.2.1` |
| `html2canvas-pro` | `^2.2.1` |
| `sonner` | `^2.0.7` |
| `next-themes` | `^0.4.6` |
| `better-sqlite3` | `^12.11.1` (one-time import only) |
| `vitest` | `^3.2.7` |
| `eslint-config-next` | `16.2.10` |

`shadcn ^4.13.0` appears as a regular (non-dev) dependency — it is the CLI and is not needed
at runtime.

### npm scripts

| Script | Action |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `eslint` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `seed` | `tsx scripts/seed.ts` |
| `seed:templates` | `tsx scripts/seed-template-bank.ts` |
| `seed:6228-gaps` | `tsx scripts/seed-6228-gap-keys.ts` |
| `db:migrate` | `tsx scripts/migrate-postgres.ts` — runs **every** `migrations/postgres/*.sql` file in filename order, on every run (idempotent) |
| `db:import-sqlite` | `tsx scripts/migrate-from-sqlite.ts` — one-time import from SQLite |
| `db:backup` | `tsx scripts/backup-db.ts` |
| `db:restore` | `tsx scripts/restore-backup.ts` |
| `import:force-structure` | `tsx scripts/import-force-structure.ts` |

### Environment variables

From `.env.example` and every `process.env.*` reference in application code
(`app/`, `lib/`, `scripts/`, `proxy.ts`):

| Variable | Required | Read in | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | `lib/db/client.ts:11` | Application queries (transaction pooler, port 6543). Throws if missing |
| `DIRECT_URL` | For migrations | `scripts/migrate-postgres.ts:8`, `scripts/backup-db.ts:114` | Session pooler (port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `lib/supabase/{client,server,proxy}.ts`, `lib/storage/client.ts:20` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | `lib/supabase/{client,server,proxy}.ts` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (for files) | `lib/storage/client.ts:21` | service_role — **server-only**, for access to the private bucket |
| `DB_TIMING` | No | `lib/db/client.ts:42` | `=1` enables per-round-trip timing/row-count logging |
| `NODE_ENV` | Automatic | `lib/db/client.ts:22` | (see section 11 — the branch is meaningless) |

Note: `.env.example` **contains a real project URL**
(`https://lwhxfjdwbwfxdnpilgeo.supabase.co`) rather than a placeholder. The file is
git-tracked per its own comment.

### Configuration

- `next.config.ts` — **empty** (`const nextConfig: NextConfig = {}`). No image config,
  headers, redirects, or `outputFileTracingIncludes`.
- `tsconfig.json` — `strict: true`, `target: ES2017`, alias `@/* -> ./*`.
- **No `tailwind.config.*`** — Tailwind v4 is configured via `postcss.config.mjs` and
  `app/globals.css`.
- **No `middleware.ts`** — in Next 16 the file is named `proxy.ts` (at the root) and exports
  `proxy()` + `config.matcher`.
- `vercel.json` — `{"regions": ["dub1"]}` only.

---

## 3. Database schema — effective current state

### 3.1 Migrations in execution order

The `migrations/` directory contains **two series**:

1. `migrations/0001_init.sql`, `0002_add_battalions_and_taxes.sql`, `0003_reserve_and_hq.sql` —
   a **stale** SQLite series. `scripts/migrate-postgres.ts:15` reads only from
   `migrations/postgres/`, so these three files **are never executed**. They are remnants of
   the original system.
2. `migrations/postgres/*.sql` — 24 files, the actual schema.

| # | File | What it changes |
|---|---|---|
| 001 | `001_init.sql` | Base schema: 13 tables + 6 indexes (see 3.2) |
| 002 | `002_trainings.sql` | `trainings`, `training_sessions` + 3 indexes |
| 003 | `003_record_colors.sql` | `certifications.color_hex`, `trainings.color_hex` |
| 004 | `004_users.sql` | `users` (PK = Supabase Auth UUID) + `idx_users_status` |
| 005 | `005_influencing_factors.sql` | `influencing_factors`, `influencing_factor_battalions` |
| 006 | `006_sqlite_import_gap.sql` | `training_unit_hours`; `training_sessions.sub_framework`/`content`; drops NOT NULL from `start_time`/`end_time`; `course_colors.created_at` |
| 007 | `007_training_session_notes.sql` | `training_sessions.notes` |
| 008 | `008_request_soldiers_and_registration_lock.sql` | `battalion_request_soldiers`; `certification_battalion_quotas.registration_lock_at` (superseded by 021) |
| 009 | `009_certification_files.sql` | `certification_files` (metadata only; bytes in Storage) |
| 010 | `010_pivot_report_widgets.sql` | `pivot_report_widgets` (JSONB config) |
| 011 | `011_roster_request_link.sql` | `roster_entries.battalion_request_id`; drops NOT NULL from `certification_id`; CHECK `roster_entries_parent_present` |
| 012 | `012_battalion_scoped_roles.sql` | `users.battalion_id`/`requested_role_text`/`requested_battalion_text`; CHECK `users_role_allowed` + `users_battalion_scope_valid` |
| 013 | `013_force_structure.sql` | "Two Forward" (שניים לפנים) module: `companies`, `roles`, `role_reference`, `role_assignments`, `bank_soldiers`, `soldier_certifications`, `drone_models`, `certification_aliases` |
| 014 | `014_org_unit_types.sql` | `org_unit_types`, `org_unit_type_patterns`, `org_unit_type_members`, `org_unit_manual_counts`; VIEWS `v_org_unit_counts_base`, `v_org_unit_counts` |
| 015 | `015_gap_requirement_keys.sql` | `certification_families`, `gap_requirement_keys`, `gap_nominations`; `certification_gap_rows.family_id`/`canonical_cert_name`/`active_source`; `certification_gap_values.active_source`; VIEWS `v_role_status`, `v_certification_gaps` |
| 016 | `016_roster_tracking.sql` | `roster_admin_confirmations`, `certification_required_documents`, `roster_required_documents`; `certification_prerequisites.template_id` + drops NOT NULL from `certification_id` |
| 017 | `017_system_settings.sql` | `system_settings` (key/value) |
| 018 | `018_gap_snapshots.sql` | `certification_gap_snapshots` — **deliberately created unwired**: the file's own comment says "no job, no trigger, nothing writes this table" |
| 019 | `019_posting_and_pending_identity.sql` | `role_assignments.is_posted`/`pending_pn`/`pending_name` + drops NOT NULL from `full_name`/`personal_number`; `bank_soldiers.pending_pn`; redefines `v_role_status` |
| 020 | `020_force_structure_edit_snapshots.sql` | `force_structure_edit_snapshots` (JSONB payload) |
| 021 | `021_certification_registration_lock_date.sql` | `certifications.registration_lock_date` TEXT + format CHECK; one-time backfill from `MIN(registration_lock_at)` |
| 022 | `022_certification_registration_lock_hour.sql` | `certifications.registration_lock_hour` SMALLINT + range CHECK 0–23 + "hour needs date" CHECK |
| 023 | `023_roster_status_allowed_values.sql` | CHECK `roster_entries_status_allowed` — the nine values; **no backfill**, raises EXCEPTION if any out-of-set row exists |
| 024 | `024_roster_requires_lodging.sql` | `roster_entries.requires_lodging` SMALLINT + CHECK `IN (0,1)` |

### 3.2 Effective schema (after all migrations)

Columns added by a later migration are marked **[NNN]**.

#### `battalions`
| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | SERIAL | No | | PK |
| `code` | TEXT | No | | UNIQUE |
| `name` | TEXT | No | | |
| `color_hex` | TEXT | No | `'#64748B'` | |
| `is_active` | SMALLINT | No | `1` | |

#### `certifications`
| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | SERIAL | No | | PK |
| `template_id` | INTEGER | Yes | | FK `certification_templates(id)` ON DELETE SET NULL |
| `name` | TEXT | No | | |
| `domain` | TEXT | Yes | | |
| `start_date` | TEXT | No | | `'yyyy-MM-dd'` |
| `end_date` | TEXT | Yes | | NULL/`''` = single day |
| `location` | TEXT | Yes | | |
| `total_slots` | INTEGER | Yes | | **NULL = unlimited** |
| `registration_open` | SMALLINT | No | `0` | |
| `status` | TEXT | No | `'draft'` | enum-like, see 3.3 |
| `notes` | TEXT | Yes | | |
| `origin_request_id` | INTEGER | Yes | | no FK |
| `gap_row_id` | INTEGER | Yes | | FK `certification_gap_rows(id)` SET NULL |
| `created_by_role` | TEXT | No | `'brigade'` | |
| `created_at` / `updated_at` | TIMESTAMPTZ | No | `NOW()` | updated manually, no triggers |
| `color_hex` **[003]** | TEXT | Yes | | NULL = computed color |
| `registration_lock_date` **[021]** | TEXT | Yes | | CHECK `~ '^\d{4}-\d{2}-\d{2}$'`; **NULL = no lock** |
| `registration_lock_hour` **[022]** | SMALLINT | Yes | | CHECK 0–23; CHECK requires `registration_lock_date IS NOT NULL`; **NULL = end of the lock day** |

Indexes: `idx_certifications_status(status)`, `idx_certifications_start_date(start_date)`.

#### `roster_entries`
| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | SERIAL | No | | PK |
| `certification_id` | INTEGER | **Yes [011]** | | FK `certifications(id)` CASCADE |
| `battalion_id` | INTEGER | No | | FK `battalions(id)` |
| `full_name` | TEXT | No | | |
| `personal_number` | TEXT | **No** | | see note below |
| `company_platoon` | TEXT | Yes | | |
| `phone` | TEXT | Yes | | |
| `commander_name` / `commander_phone` | TEXT | Yes | | |
| `has_prior_certification` | SMALLINT | No | `0` | |
| `prior_certification_details` | TEXT | Yes | | |
| `meets_prerequisite` | SMALLINT | Yes | | **NULL = not marked** |
| `notes` | TEXT | Yes | | |
| `status` | TEXT | No | `'registered'` | CHECK `roster_entries_status_allowed` **[023]** |
| `outcome_reason` | TEXT | Yes | | |
| `is_reserve` | SMALLINT | No | `0` | `1` = reserve (עתודה) |
| `created_at` / `updated_at` | TIMESTAMPTZ | No | `NOW()` | |
| `battalion_request_id` **[011]** | INTEGER | Yes | | FK `battalion_requests(id)` |
| `requires_lodging` **[024]** | SMALLINT | No | `0` | CHECK `IN (0,1)` — "נדרש לינה" (lodging required) |

CHECK `roster_entries_parent_present` **[011]**:
`certification_id IS NOT NULL OR battalion_request_id IS NOT NULL`.
Indexes: `idx_roster_certification`, `idx_roster_battalion`, `idx_roster_battalion_request` **[011]**.

**Note on `personal_number`:** the column is `TEXT NOT NULL` — it cannot be NULL. The
"awaiting personal number" state is represented in `role_assignments.pending_pn` /
`bank_soldiers.pending_pn` (Two Forward module), **not** in `roster_entries`.
`lib/roster/copy-format.ts` treats an empty string as missing.

#### `certification_battalion_quotas`
| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | SERIAL | No | | PK |
| `certification_id` | INTEGER | No | | FK CASCADE |
| `battalion_id` | INTEGER | No | | FK CASCADE |
| `allocated_slots` | INTEGER | No | `0` | |
| `notes` | TEXT | Yes | | |
| `registration_lock_at` **[008]** | TIMESTAMPTZ | Yes | | **Superseded** — 021 moved the deadline to `certifications`; retained so history isn't lost, no code reads it for enforcement |

UNIQUE `(certification_id, battalion_id)` — this is what prevents duplication in the
`listBattalionAllocations` JOIN.

#### `users`
| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| `id` | UUID | No | | PK = `auth.users.id` |
| `email` | TEXT | No | | |
| `full_name` | TEXT | Yes | | |
| `role` | TEXT | No | `'viewer'` | CHECK `users_role_allowed` **[012]** |
| `status` | TEXT | No | `'pending'` | |
| `approved_by` | UUID | Yes | | FK `users(id)` |
| `approved_at` | TIMESTAMPTZ | Yes | | |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | |
| `battalion_id` **[012]** | INTEGER | Yes | | FK `battalions(id)`; CHECK `users_battalion_scope_valid` |
| `requested_role_text` **[012]** | TEXT | Yes | | free text from signup |
| `requested_battalion_text` **[012]** | TEXT | Yes | | |

`users_battalion_scope_valid`: a battalion-scoped role ⇔ `battalion_id IS NOT NULL`.
Indexes: `idx_users_status`, `idx_users_battalion`.

#### Remaining tables (summary)

| Table | Key columns | Notes |
|---|---|---|
| `certification_gap_rows` | `id`, `certification_name`, `sort_order`, `family_id` **[015]**, `canonical_cert_name` **[015]**, `active_source` **[015]** NOT NULL DEFAULT `'establishment'` | CHECK `active_source IN ('operational','establishment')` |
| `certification_gap_values` | PK `(row_id, battalion_id)`, `gap_count`, `sent_count`, `active_source` **[015]** nullable | `active_source` NULL = inherits from `certification_gap_rows` |
| `certification_templates` | 16 columns: `name`, `domain`, `default_location`, `default_slots`, `default_notes`, `gap_row_id`, `checkin_details`, `duration_text`, `trainee_ratio`, `ammo_required`, `requirements_text`, `equipment_text`, `contacts_text`, `color_hex` **[003]** | `default_slots` NULL = unlimited |
| `certification_prerequisites` | `certification_id` (nullable **[016]**), `template_id` **[016]**, `description` | CHECK `cert_prereq_parent_present` |
| `certification_taxes` | `certification_id`, `role_name`, `is_fulfilled` SMALLINT, `notes` | "מיסים" (taxes / mandatory contributions) |
| `battalion_requests` | `battalion_id`, `requested_cert_type`, `quantity_needed`, `reason`, `urgency`, `desired_date`, `notes`, `status`, `linked_certification_id` | |
| `battalion_request_soldiers` **[008]** | `request_id`, `full_name`, `personal_number` (nullable), `phone`, `battalion_id` | see 3.4 — duplicate model |
| `notifications` | `type`, `target_role`, `entity_type`, `entity_id`, `message`, `is_read` | `idx_notifications_target` |
| `status_history` | `entity_type`, `entity_id`, `old_status`, `new_status`, `changed_by_role`, `note`, `changed_at` | append-only |
| `course_colors` | PK `name`, `color_hex`, `created_at` **[006]** | |
| `trainings` | `name`, `domain`, `start_date`, `end_date`, `contact_name`, `contact_phone`, `notes`, `color_hex` **[003]** | |
| `training_sessions` | `training_id`, `battalion_id`, `session_date`, `start_time` (nullable **[006]**), `end_time` (nullable **[006]**), `location`, `instructor_name`, `instructor_phone`, `sub_framework` **[006]**, `content` **[006]**, `notes` **[007]** | |
| `training_unit_hours` **[006]** | UNIQUE `(training_id, day_date, battalion_id)`, `hours` NUMERIC | |
| `influencing_factors` / `influencing_factor_battalions` **[005]** | `name`, `start_date`, `end_date`, `notes` / composite PK | "גורם משפיע" (influencing factor) |
| `certification_files` **[009]** | `certification_id`, `storage_path` UNIQUE, `original_name`, `mime_type`, `size_bytes` BIGINT, `uploaded_by` TEXT | bytes live in Storage |
| `pivot_report_widgets` **[010]** | `id` UUID DEFAULT `gen_random_uuid()`, `name`, `config` JSONB, `created_by` | |
| `companies` **[013]** | `battalion_id`, `code`, `name`, `kind` CHECK `IN ('rifle','support')`, `sort_order`; UNIQUE `(battalion_id, code)` | |
| `roles` **[013]** | `company_id`, `department`, `squad`, `serial`, `role_name`, `req1..req3`, sort keys `dept_sort`/`squad_sort`/`row_sort`; UNIQUE `(company_id, serial)` | static reference data |
| `role_reference` **[013]** | `company_kind` CHECK, `department`, `serial`, `role_name`, `req1..3`, `provenance`; UNIQUE `(company_kind, serial)` | written only by the importer |
| `role_assignments` **[013]** | `role_id` UNIQUE, `full_name` (nullable **[019]**), `personal_number` (nullable **[019]**), `rank`, `phone`, `is_posted` **[019]**, `pending_pn` **[019]**, `pending_name` **[019]** | CHECKs: `(pending_pn=1) = (personal_number IS NULL)`, `(pending_name=1) = (full_name IS NULL)` |
| `bank_soldiers` **[013]** | `company_id`, `department`, `full_name`, `personal_number` (nullable **[019]**), `rank`, `unavailable_until`, `note`, `pending_pn` **[019]** | UNIQUE `(company_id, personal_number)` |
| `soldier_certifications` **[013]** | UNIQUE `(personal_number, certification_name)`, `raw_name`, `source` CHECK `IN ('manual','import','certifications_module')` | |
| `drone_models` **[013]** | `name` UNIQUE, `sort_order` | |
| `certification_aliases` **[013]** | PK `alias`, `canonical_name`, `kind` CHECK `IN ('typo','spelling','synonym','quarantine')` | |
| `org_unit_types` **[014]** | `code` UNIQUE, `name`, `kind` CHECK `IN ('base','composite')`, `sort_order` | |
| `org_unit_type_patterns` **[014]** | `unit_type` FK, `grain` CHECK `IN ('battalion','company','department','squad')`, `match_target` CHECK `IN ('company_kind','company_name','department','squad')`, `pattern` | read **through the VIEW** only |
| `org_unit_type_members` **[014]** | PK `(parent_code, child_code)` | read **through the VIEW** only |
| `org_unit_manual_counts` **[014]** | PK `(battalion_id, unit_type)`, `unit_count` CHECK `>= 0`, `note` | |
| `certification_families` **[015]** | `name` UNIQUE, `ink`, `line`, `bg`, `sort_order` | family colors |
| `gap_requirement_keys` **[015]** | `gap_row_id`, `battalion_id`, `source` CHECK `IN ('operational','establishment')`, `qty` CHECK `>= 0`, `unit_type` FK; UNIQUE `(gap_row_id, battalion_id, source, sort_order)` | |
| `gap_nominations` **[015]** | `gap_row_id`, `battalion_id`, `certification_id`, `role_assignment_id`, `free_text_name`, `note`, `created_by_role` | CHECK `gap_nominations_exactly_one_subject`: either `role_assignment_id` or `free_text_name`, not both |
| `roster_admin_confirmations` **[016]** | `roster_entry_id` UNIQUE, `confirmed_at`, `confirmed_by_role`, `note` | separate tracking layer |
| `certification_required_documents` **[016]** | UNIQUE `(template_id, doc_type)` | |
| `roster_required_documents` **[016]** | UNIQUE `(roster_entry_id, doc_type)`, `is_provided`, `provided_at`, `note` | |
| `system_settings` **[017]** | PK `key`, `value`, `description`, `updated_by` | **unused in code** |
| `certification_gap_snapshots` **[018]** | UNIQUE `(row_id, battalion_id, snapshot_month)`, `gap_count`, `held_count`, `required_count`, `surplus_count`; CHECK `snapshot_month ~ '^\d{4}-\d{2}$'` | **unused in code** |
| `force_structure_edit_snapshots` **[020]** | `battalion_id`, `created_by_user`, `created_by_role`, `payload` JSONB | `idx_fs_edit_snapshots_batt_user` |

#### VIEWS

| View | Defined in | Contents |
|---|---|---|
| `v_org_unit_counts_base` | 014 | Unit counts from `roles` via patterns |
| `v_org_unit_counts` | 014 | Final count, including `unit_count_source` (`'manual'` or computed) |
| `v_role_status` | 015, **redefined in 019** | Establishment/assignment state per post |
| `v_certification_gaps` | 015 | Gap computation: `required` (from `gap_requirement_keys` × `v_org_unit_counts`), `held` (intersection of `soldier_certifications` ∩ `role_assignments`), `surplus` |

### 3.3 Status columns and their full value sets

| Column | Code constant | Values | DB CHECK |
|---|---|---|---|
| `certifications.status` | `CERTIFICATION_STATUSES` (`lib/types.ts:10`) | `draft`, `open`, `full`, `closed`, `in_progress`, `completed`, `cancelled` | **None** |
| `roster_entries.status` | `ROSTER_STATUSES` (`lib/types.ts:40`) | `registered`, `pending_approval`, `approved`, `rejected`, `participated`, `did_not_participate`, `did_not_report`, `passed`, `failed` | **Yes** — `roster_entries_status_allowed` **[023]** |
| `battalion_requests.status` | `REQUEST_STATUSES` (`lib/types.ts:72`) | `opened`, `in_review`, `approved`, `rejected`, `certification_opened`, `closed` | **None** |
| `battalion_requests.urgency` | `URGENCY_LEVELS` (`lib/types.ts:89`) | `low`, `normal`, `high`, `urgent` | **None** |
| `users.role` | `USER_ROLES` (`lib/types.ts:118`) | `super_admin`, `editor`, `viewer`, `viewer_battalion`, `editor_battalion` | **Yes** — `users_role_allowed` **[012]** |
| `users.status` | `USER_STATUSES` (`lib/types.ts:138`) | `pending`, `approved`, `rejected` | **None** |
| `notifications.type` | `NotificationType` (`lib/types.ts:402`) | `certification_opened`, `opened_from_request`, `soldier_added`, `date_approaching`, `registration_closed`, `soldier_approved`, `soldier_rejected`, `certification_cancelled`, `certification_changed`, `user_registered` | **None** |

**There is no `CREATE TYPE` / native enum anywhere** — every enum is TEXT + CHECK, or TEXT
with no constraint at all.

### 3.4 NULL as semantic meaning

| Column | NULL means |
|---|---|
| `certifications.total_slots` | No seat limit (unlimited). `computeSlotsRemaining` in `lib/utils/slots.ts` returns NULL |
| `certifications.registration_lock_date` | No lock deadline set — **read as "open", never as "passed"** (`lib/utils/registration-lock.ts`) |
| `certifications.registration_lock_hour` | End of the lock day (hour 24) — preserves pre-022 semantics |
| `certifications.color_hex` / `trainings.color_hex` | Color computed from the name (`lib/utils/cert-colors.ts`) |
| `certifications.end_date` (or `''`) | Single-day certification |
| `roster_entries.meets_prerequisite` | Prerequisite was not marked (not "does not meet") |
| `certification_battalion_quotas` — row absent | No allocation for that battalion; distinct from an allocation of 0 |
| `certification_gap_values.active_source` | Inherits from `certification_gap_rows.active_source` |
| `users.battalion_id` | Global (non-battalion-scoped) role |
| `certification_templates.default_slots` | Unlimited |

### 3.5 Unused / indirectly used tables

| Table | State |
|---|---|
| `system_settings` **[017]** | **Dead** — zero references across `lib/`, `app/`, `scripts/`. Created for the "registration close window" and never wired |
| `certification_gap_snapshots` **[018]** | **Dead** — the migration comment states this. `getGapRowSnapshot` (`lib/db/repositories/certification-gaps.ts:130`) does **not** read it; it computes live from `certification_gap_values` + `roster_entries` |
| `org_unit_type_patterns`, `org_unit_type_members` **[014]** | No direct TS reference, but both are read by `v_org_unit_counts_base` / `v_org_unit_counts`, which are read from `lib/db/repositories/gaps.ts`. **In indirect use** |
| `training_unit_hours` **[006]** | Mentioned only in `scripts/migrate-from-sqlite.ts` (import). No application reads |
| `role_reference` **[013]** | Written only in `lib/import/write-force-structure.ts:220`. No application reads |
| `certification_battalion_quotas.registration_lock_at` **[008]** | Deliberately superseded column (021) |

**Code referencing a table/column with no migration:** none found. Every table name appearing
in SQL inside `lib/` exists in the migrations (`pair`, `turns`, `unnest` found by the scan are
SQL aliases/functions, not tables).

---

## 4. Repository layer

`lib/db/client.ts` — a single pool (`pg.Pool`, `max: 10`) held on a global, exposing
`query` / `queryOne` / `execute` / `withTransaction`. Every row passes through `normalizeRow`,
which converts `Date` to an ISO string.

| File | Exported functions | Tables |
|---|---|---|
| `audit.ts` | `recordStatusChange`, `listStatusHistory` | `status_history` |
| `battalion-dashboard.ts` | `listBattalionAllocations`, `ALLOCATION_OPPORTUNITIES_SQL`, `listAllocationOpportunities`, `getQuarterCompletion`, `listAdminConfirmations`, `confirmAdmin`, `undoAdminConfirmation`, `listBattalionTasks` | `certifications`, `certification_battalion_quotas`, `roster_entries`, `roster_admin_confirmations`, `certification_prerequisites`, `certification_required_documents`, `roster_required_documents` |
| `battalion-summary.ts` | `getBattalionSummary` | `certifications`, `certification_battalion_quotas`, `roster_entries`, `battalion_requests` |
| `battalions.ts` | `listBattalions`, `getBattalionByCode`, `getBattalionById` | `battalions` |
| `certification-files.ts` | `listByCertification`, `getById`, `create`, `deleteFile` | `certification_files` |
| `certification-gaps.ts` | `listGapRows`, `addGapRow`, `deleteGapRow`, `upsertGapValue`, `upsertGapSentCount`, `getGapRowSnapshot`, `GAP_BATTALION_CODES`, `listGapAggregate` | `certification_gap_rows`, `certification_gap_values`, `battalions`, `certifications`, `certification_templates`, `roster_entries` |
| `certification-pivot.ts` | `runPivotReport`, `NO_DOMAIN_LABEL`, `listDomains`, `listDomainsWithCertifications` | `certifications`, `roster_entries`, `battalions` |
| `certifications.ts` | `listCertifications`, `getCertificationById`, `createCertification`, `updateCertification`, `deleteCertification`, `updateCertificationStatus`, `confirmCertificationCompletion`, `listPrerequisites`, `replacePrerequisites`, `getCertificationBattalions`, `listQuotas`, `getQuota`, `replaceQuotas`, `listTaxes`, `replaceTaxes`, `setTaxFulfilled` | `certifications`, `certification_prerequisites`, `certification_battalion_quotas`, `certification_taxes`, `certification_gap_values`, `roster_entries`, `status_history`, `notifications`, `battalions` |
| `course-colors.ts` | `listPaletteColors`, `getCourseColorMap`, `getOrAssignCourseColor` | `course_colors` |
| `export.ts` | `getExportData`, `getTrainingExportData` | via other repositories |
| `force-structure.ts` | `listCompanyKpis`, `listDepartmentKpis`, `listSquadDroneCoverage`, `listPendingIdentity`, `countPendingIdentity`, `isAssignmentUsable`, `listCanvasRoles`, `listBankSoldiers`, `lookupSoldiers`, `moveAssignment`, `placeBankOnRole`, `openEditSession`, `closeEditSession`, `revertEditSession` | `companies`, `roles`, `role_assignments`, `bank_soldiers`, `soldier_certifications`, `drone_models`, `force_structure_edit_snapshots`, `v_role_status` |
| `gaps.ts` | `listCertificationFamilies`, `listUnitCounts`, `listGapKeys`, `listComputedGaps`, `listNominations`, `setActiveSource`, `replaceOperationalKey`, `addNomination`, `deleteNomination`, `liveNumbers`, `describeKey`, `countClosedThisQuarter` | `v_certification_gaps`, `v_org_unit_counts`, `gap_requirement_keys`, `gap_nominations`, `certification_families`, `org_unit_types`, `roles`, `role_assignments`, `certifications`, `certification_templates`, `certification_gap_values` |
| `influencing-factors.ts` | `listInfluencingFactors`, `getInfluencingFactorById`, `getInfluencingFactorBattalions`, `getInfluencingFactorBattalionIds`, `createInfluencingFactor`, `updateInfluencingFactor`, `deleteInfluencingFactor` | `influencing_factors`, `influencing_factor_battalions`, `battalions` |
| `notifications.ts` | `SUPER_ADMIN_NOTIFICATION_ROLE`, `createNotification`, `listNotifications`, `markNotificationRead`, `markAllNotificationsRead` | `notifications` |
| `open-tasks.ts` | `listRegistrationGaps`, `listOpenUnlimitedRegistrations`, `listTaxGaps`, `listPendingCompletionConfirmations`, `countPendingRequests`, `countPendingApprovals`, `listOpenTasks` | `certifications`, `roster_entries`, `certification_taxes`, `battalion_requests` |
| `pivot-widgets.ts` | `listSavedWidgets`, `getSavedWidgetById`, `createSavedWidget`, `updateSavedWidget`, `deleteSavedWidget` | `pivot_report_widgets` |
| `reports.ts` | `certificationsByMonth`, `openForRegistration`, `completedCertifications`, `openRequestsByBattalion`, `gapsByBattalion`, `battalionRosterReport`, `rosterCounts` | `certifications`, `roster_entries`, `battalion_requests`, `battalions`, `certification_battalion_quotas` |
| `request-soldiers.ts` | `listByRequest`, `createRequestSoldier`, `deleteRequestSoldier`, `deleteByRequest` | `battalion_request_soldiers` |
| `requests.ts` | `listRequests`, `getRequest`, `createRequest`, `updateRequest`, `updateRequestStatus`, `openCertificationFromRequest`, `deleteRequest`, `linkRequestToCertification` | `battalion_requests`, `battalion_request_soldiers`, `roster_entries`, `status_history`, `notifications`, `battalions` |
| `roster.ts` | `listRosterForCertification`, `listReserveForCertification`, `listRosterForBattalion`, `listRosterForBattalionCertification`, `listRosterForRequest`, `addRequestRosterEntries`, `getRosterEntry`, `addRosterEntry`, `countBattalionQuotaUsage`, `getBattalionQuotaUsage`, `eligibilityOf`, `addBattalionRosterEntry`, `updateRosterEntry`, `updateRosterStatus`, `deleteRosterEntry`, `approveTraineeList` | `roster_entries`, `certifications`, `certification_battalion_quotas`, `battalions` |
| `templates.ts` | `listTemplates`, `getCourseColorMap`, `getTemplate`, `listTemplatesByName`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `renameCourse` | `certification_templates`, `certification_gap_rows` |
| `trainings.ts` | `listTrainings`, `getTrainingById`, `listSessionsForTraining`, `getTrainingBattalions`, `createTraining`, `updateTraining`, `deleteTraining`, `replaceTrainingSessions`, `addSession`, `updateSession`, `deleteSession` | `trainings`, `training_sessions`, `battalions` |
| `users.ts` | `getUserById`, `listPendingUsers`, `listAllUsers`, `ensureUser`, `approveUser`, `updateUserRole`, `rejectUser` | `users` |

### 4.1 N+1 — queries inside loops

| Location | Description | Severity |
|---|---|---|
| `lib/db/repositories/export.ts:67` | `certs.map(async …)` with **5 queries per certification** (`listQuotas`, `listRosterForCertification`, `listReserveForCertification`, `listTaxes`, `listPrerequisites`) → 5N | **High** — feeds `/reports` and all exports |
| `lib/db/repositories/export.ts:177` | `trainings.map(async …)` → `listSessionsForTraining` per training | Medium |
| `app/calendar/page.tsx:35` | `getCertificationBattalions` per certification | **High** — the de facto home page |
| `app/calendar/page.tsx:41` | `getTrainingBattalions` per training | High |
| `app/calendar/page.tsx:45` | `getInfluencingFactorBattalions` per factor | Medium |
| `app/reports/page.tsx:45,51` | Same pattern as the calendar | High |
| `app/battalions/[code]/page.tsx:130` | `getInfluencingFactorBattalions` per factor | Medium |
| `app/reports/pivot/page.tsx:36` | `runPivotReport` per saved widget | **High** — a full report per widget |
| `lib/db/repositories/influencing-factors.ts:99` | INSERT per `battalion_id` (inside a transaction) | Low (write, small N) |
| `lib/db/repositories/certifications.ts:356, 421, 444` | INSERT in a loop in `replacePrerequisites` / `replaceQuotas` / `replaceTaxes` (inside a transaction) | Low |
| `lib/db/repositories/certifications.ts:308` | UPDATE + `recordStatusChange` per roster entry in `confirmCertificationCompletion` | Low–Medium |
| `lib/db/repositories/trainings.ts:114, 178` | INSERT per session | Low |
| `lib/db/repositories/requests.ts:163` | INSERT into `roster_entries` per soldier in a request | Low |
| `lib/db/repositories/roster.ts:568` | UPDATE + `recordStatusChange` per entry in `approveTraineeList` | Low |

Loops that are **not** N+1 (in-memory processing only, verified): `app/templates/page.tsx:12`,
`app/trainings/[id]/page.tsx:39`, `lib/db/repositories/battalion-dashboard.ts:138`, and all
loops in `components/`.

`lib/db/repositories/battalion-dashboard.ts:listBattalionAllocations` was deliberately fixed
to avoid N+1: roster counts come from a single grouped subquery, and soldiers are fetched in
one query using `certification_id = ANY($2::int[])`.

---

## 5. API surface — full route inventory

**67 route files, 96 method handlers.**

`authorization source` classification per the code as written (comments were filtered out —
several routes mention their previous gate in a comment):

- `session` — derives the user/role from the authenticated server-side session
- `active_role cookie` — reads the role from the cookie **(spoofable)**
- `permission predicate` — calls `canManage*` / `can*`
- `none` — no guard

Where a route combines `session` + a `permission predicate` on `AppUser`, the classification
is `session` (the predicate receives the authenticated identity). Where the predicate receives
a `Role` from the cookie and there is no session check, the classification is
`active_role cookie`.

| Method | Path | Purpose | Validation | Authorization source |
|---|---|---|---|---|
| GET | `/api/me` | Current user identity | none | `session` (`getCurrentUser`) |
| POST | `/api/role` | Sets the `active_role` cookie | none | **`none`** |
| GET | `/api/audit` | Status history for an entity | none | **`none`** |
| GET | `/api/admin/users` | All users | none | `session` (`requireSuperAdmin`) |
| PATCH, DELETE | `/api/admin/users/[id]` | Approve / set role / reject | `userPatchSchema` | `session` (`requireSuperAdmin`) |
| GET | `/api/battalions` | Battalion list (scope-filtered) | none | `session` (`getBattalionScope`) |
| GET | `/api/battalions/[id]/summary` | Battalion summary | none | `session` (`requireApprovedUser` + `denyOutOfScope`) |
| GET | `/api/battalions/[id]/weekly-export` | Weekly PDF | `battalionIdParamSchema`, `weeklyExportQuerySchema` | `session` (`requireApprovedUser` + `denyOutOfScope`) |
| GET, POST | `/api/battalions/[id]/certifications/[certId]/roster` | Battalion roster | `battalionRosterEntrySchema` | `session` (`requireApprovedUser`+`denyOutOfScope` / `requireBattalionEditor`) |
| PATCH, DELETE | `/api/battalions/[id]/certifications/[certId]/roster/[entryId]` | Update/delete soldier | `battalionRosterEntrySchema` | `session` (`requireBattalionEditor`) |
| GET | `/api/certifications` | Certification list | none | **`none`** |
| POST | `/api/certifications` | Create certification | `certificationCreateSchema` | **`active_role cookie`** |
| GET | `/api/certifications/[id]` | Certification + prereqs/quotas/taxes | none | **`none`** |
| PATCH | `/api/certifications/[id]` | Partial update | `certificationPatchSchema` | `session` (`requireCertificationManager` = `requireEditor` + cookie as scope) |
| DELETE | `/api/certifications/[id]` | Delete + Storage cleanup | none | `session` (`requireCertificationManager`) |
| PATCH | `/api/certifications/[id]/status` | Status change | `certificationStatusSchema` | `session` (`requireApprovedUser` + `canManageCertificationStatus`) |
| POST | `/api/certifications/[id]/confirm-completion` | Confirm completion + gap update | none | **`active_role cookie`** |
| GET, POST | `/api/certifications/[id]/files` | Attachments + upload | `certificationFileUploadSchema` | `session` (`requireEditor`) |
| DELETE | `/api/certifications/[id]/files/[fileId]` | Delete file | none | `session` (`requireEditor`) |
| POST | `/api/certifications/[id]/quotas/[battalionId]/approve-trainees` | Approve trainee list | `traineeApprovalSchema` | `session` (`requireEditor`) + cookie for battalion scope |
| GET | `/api/certifications/[id]/roster` | Certification roster | none | `session` (`requireApprovedUser`) |
| POST | `/api/certifications/[id]/roster` | Add soldier | `rosterEntrySchema` | `session` (`requireApprovedUser` + `canManageRosterEntry`) |
| GET, PATCH, DELETE | `/api/roster/[entryId]` | Single soldier | `rosterEntrySchema` | `session` (`requireApprovedUser` + `canManageRosterEntry`) |
| PATCH | `/api/roster/[entryId]/status` | Soldier status | `rosterStatusSchema` | `session` (`requireApprovedUser` + `canManageRosterEntry`) |
| PUT, DELETE | `/api/roster/[entryId]/admin-confirmation` | Battalion-clerk confirmation | none | `session` (`requireBattalionEditor`) |
| PATCH | `/api/taxes/[taxId]/fulfilled` | Mark a tax fulfilled | none | **`active_role cookie`** |
| GET | `/api/templates` | Template bank | none | **`none`** |
| POST | `/api/templates` | New template | `templateSchema` | **`active_role cookie`** |
| GET | `/api/templates/[id]` | Single template | none | **`none`** |
| PATCH, DELETE | `/api/templates/[id]` | Update/delete | `templateSchema` | **`active_role cookie`** |
| PATCH | `/api/templates/course/[name]` | Rename course | none | **`active_role cookie`** |
| GET | `/api/trainings` | Training list | none | **`none`** |
| POST | `/api/trainings` | New training | `trainingSchema` | **`active_role cookie`** |
| GET | `/api/trainings/[id]` | Single training | none | **`none`** |
| PATCH, DELETE | `/api/trainings/[id]` | Update/delete | `trainingSchema` | **`active_role cookie`** |
| POST | `/api/trainings/[id]/sessions` | New block | `trainingSessionSchema` | **`active_role cookie`** |
| PATCH, DELETE | `/api/trainings/[id]/sessions/[sessionId]` | Update/delete block | `trainingSessionSchema` | **`active_role cookie`** |
| GET | `/api/requests` | Battalion requests | none | `session` (`requireApprovedUser` + `getBattalionScope`) |
| POST | `/api/requests` | New request | `requestSchema` | `session` (`requireApprovedUser` + `canEditBattalion`) |
| GET, PATCH, DELETE | `/api/requests/[id]` | Single request | `requestSchema` | `session` (`requireEditor` + `denyOutOfScope`) |
| PATCH | `/api/requests/[id]/status` | Request status | `requestStatusSchema` | **`active_role cookie`** |
| GET, POST | `/api/requests/[id]/soldiers` | Soldiers in a request | `requestSoldierSchema` | `session` (`requireApprovedUser`+`denyOutOfScope` / `requireEditor`) |
| DELETE | `/api/requests/[id]/soldiers/[soldierId]` | Remove soldier | none | `session` (`requireEditor`) |
| POST | `/api/requests/[id]/link-certification` | Link to certification | none | **`active_role cookie`** |
| POST | `/api/requests/[id]/open-certification` | Open certification from request | `certificationSchema` | **`active_role cookie`** |
| GET | `/api/certification-gaps` | Gap matrix | none | `session` (`requireApprovedUser` + `getBattalionScope`) |
| POST | `/api/certification-gaps` | New gap row | none (manual check) | **`active_role cookie`** |
| DELETE | `/api/certification-gaps/[rowId]` | Delete row | none | **`active_role cookie`** |
| PUT | `/api/certification-gaps/[rowId]/value` | Update gap | none | **`active_role cookie`** |
| PUT | `/api/certification-gaps/[rowId]/sent` | Update "sent" count | none | **`active_role cookie`** |
| GET | `/api/certification-gaps/[rowId]/snapshot` | Gap row snapshot | none | **`none`** |
| GET | `/api/gaps` | Computed gaps | none | `session` (`requireApprovedUser` + `denyOutOfScope`) |
| PUT | `/api/gaps/[rowId]/key` | Operational computation key | none | `session` (`requireBattalionEditor`) |
| PUT | `/api/gaps/[rowId]/active-source` | Active source | none | `session` (`requireBattalionEditor`) |
| POST, DELETE | `/api/gaps/[rowId]/nominations` | Nominations | `createSchema` (local) | `session` (`requireBattalionEditor`) |
| GET | `/api/force-structure/soldiers` | Soldier search | none | `session` (`requireApprovedUser` + `denyOutOfScope`) |
| POST | `/api/force-structure/assignments/[id]/move` | Move an assignment | `assignmentMoveSchema` | `session` (`requireBattalionEditor`) |
| POST | `/api/force-structure/bank/[id]/move` | Place from the bank | none | `session` (`requireBattalionEditor`) |
| POST | `/api/force-structure/edit-session` | Open an edit session | none | `session` (`requireBattalionEditor`) |
| DELETE | `/api/force-structure/edit-session/[id]` | Close | none | `session` (`requireBattalionEditor`) |
| POST | `/api/force-structure/edit-session/[id]/revert` | Revert edits | none | `session` (`requireBattalionEditor`) |
| GET | `/api/notifications` | Notifications by role | none | `session` (`getCurrentUser`+`getBattalionScope`) + cookie for view filtering |
| PATCH | `/api/notifications/read-all` | Mark all read | none | `session` (`getCurrentUser`+`getBattalionScope`) + cookie |
| PATCH | `/api/notifications/[id]/read` | Mark one notification read | none | **`none`** |
| GET | `/api/reports/by-month` | Certifications by month | none | `session` (`requireApprovedUser`+`getBattalionScope`) |
| GET | `/api/reports/open-for-registration` | Open for registration | none | `session` |
| GET | `/api/reports/completed` | Completed certifications | none | `session` |
| GET | `/api/reports/open-requests-by-battalion` | Open requests | none | `session` |
| GET | `/api/reports/gaps-by-battalion` | Gaps by battalion | none | `session` |
| GET | `/api/reports/roster-counts` | Roster counts | none | `session` |
| GET | `/api/reports/battalion-roster` | Soldiers by certification and battalion | none | `session` |
| GET | `/api/reports/pivot/options` | Filter options | none | `session` (`requireApprovedUser`) |
| POST | `/api/reports/pivot` | Run pivot | `pivotQuerySchema` | `session` (`requireApprovedUser`+`getBattalionScope`) |
| GET, POST | `/api/reports/pivot/widgets` | Saved widgets | `pivotWidgetSaveSchema` | `session` (`requireApprovedUser`) |
| PATCH, DELETE | `/api/reports/pivot/widgets/[id]` | Update/delete widget | `pivotWidgetSaveSchema`, `pivotWidgetIdSchema` | `session` (`requireApprovedUser`) |
| GET, POST | `/api/influencing-factors` | Influencing factors | `influencingFactorSchema` | `session` (`requireEditor`) |
| GET, PATCH, DELETE | `/api/influencing-factors/[id]` | Single factor | `influencingFactorSchema` | `session` (`requireEditor`) |

### 5.1 ★ Routes not authorized from the session — the audit's central output

**29 of 96 method handlers do not authorize from the authenticated session.**

#### A. No guard in the handler at all (`none`) — 9 handlers

| Method | Path | What is exposed | Note |
|---|---|---|---|
| POST | `/api/role` | Setting the `active_role` cookie to any value | `app/api/role/route.ts` — **this is the root**: it is what makes cookie-based authorization spoofable |
| GET | `/api/audit` | `status_history` for any entity | `app/api/audit/route.ts` — no battalion filtering |
| GET | `/api/certification-gaps/[rowId]/snapshot` | Gaps + `sent_total` for **all battalions** | `app/api/certification-gaps/[rowId]/snapshot/route.ts:6` — cross-battalion |
| PATCH | `/api/notifications/[id]/read` | Marking **any** notification read by id | `app/api/notifications/[id]/read/route.ts` — `/api/notifications` is in `API_ALLOW_ANY`, so the proxy's WRITE_METHODS check also skips it |
| GET | `/api/certifications` | All certifications | `app/api/certifications/route.ts:14` |
| GET | `/api/certifications/[id]` | Certification + quotas + roster + taxes | `app/api/certifications/[id]/route.ts:45` |
| GET | `/api/templates` | The template bank | `app/api/templates/route.ts:7` |
| GET | `/api/templates/[id]` | Single template | `app/api/templates/[id]/route.ts:7` |
| GET | `/api/trainings` + `/api/trainings/[id]` | Trainings | `app/api/trainings/route.ts:7`, `app/api/trainings/[id]/route.ts:13` |

#### B. Authorized from the `active_role` cookie only — 20 handlers

All follow the pattern `const role = await getCurrentRole(); if (!canManage*(role)) return 403;`
with no session check at all. `getCurrentRole()` (`lib/auth/current-role.ts`) **returns
`"brigade"` by default when the cookie is missing or invalid** — meaning that with no cookie,
a request is treated as brigade-level.

| Method | Path | Action |
|---|---|---|
| POST | `/api/certifications` | Create certification |
| POST | `/api/certifications/[id]/confirm-completion` | Confirm completion + **decrement gaps** |
| PATCH | `/api/taxes/[taxId]/fulfilled` | Mark a tax fulfilled |
| POST | `/api/certification-gaps` | New gap row |
| DELETE | `/api/certification-gaps/[rowId]` | Delete gap row |
| PUT | `/api/certification-gaps/[rowId]/value` | Update gap |
| PUT | `/api/certification-gaps/[rowId]/sent` | Update "sent" count |
| PATCH | `/api/requests/[id]/status` | Request status |
| POST | `/api/requests/[id]/link-certification` | Link request |
| POST | `/api/requests/[id]/open-certification` | Open certification from request |
| POST | `/api/templates` | New template |
| PATCH, DELETE | `/api/templates/[id]` | Update/delete template (2) |
| PATCH | `/api/templates/course/[name]` | Rename course |
| POST | `/api/trainings` | New training |
| PATCH, DELETE | `/api/trainings/[id]` | Update/delete training (2) |
| POST | `/api/trainings/[id]/sessions` | New block |
| PATCH, DELETE | `/api/trainings/[id]/sessions/[sessionId]` | Update/delete block (2) |

#### C. Partial cookie dependence (session present — not an authorization gap, but worth documenting)

| Path | How the cookie is used |
|---|---|
| `/api/certifications/[id]` PATCH/DELETE | `requireCertificationManager()` runs `requireEditor()` **first**, then `canManageCertifications(getCurrentRole())` as scope. The cookie can only **narrow**, never widen |
| `/api/certifications/[id]/quotas/[battalionId]/approve-trainees` | `requireEditor()` + `isBrigade(role)` from the cookie to decide whether to verify battalion match |
| `/api/notifications`, `/api/notifications/read-all` | The cookie selects the `target_role` to filter/mark — view, not authorization |
| `/api/requests/*`, `/api/certification-gaps` GET | The cookie supplies `changedByRole` for audit, or view filtering |

#### D. The actual defense layer — and why it is insufficient

`proxy.ts` **does** enforce session and role for every `/api` request:
- Unauthenticated → redirect to `/login` (lines 47–54)
- Not `approved` and not in `API_ALLOW_ANY` → 403
- `/api/admin` → `super_admin` only
- Battalion-scoped role + a path not in `BATTALION_SCOPED_API_PREFIXES` → 403
- `WRITE_METHODS` (POST/PUT/PATCH/DELETE) → requires `canEditData` (global `editor`/`super_admin`),
  except `editor_battalion` on defined paths

**But** there are three substantive caveats:

1. **The entire derivation block is wrapped in `try { … } catch { }`** (`proxy.ts:60`–`131`),
   with the comment "Best-effort gate; fall through and let page/handler guards enforce".
   If `getUserById` fails (DB fault, pooler timeout) the request **continues with no role
   enforcement at all** — and the 29 handlers above have no "handler guard" to enforce it.
2. `API_ALLOW_ANY` includes `/api/notifications`, so `PATCH /api/notifications/[id]/read`
   is also exempt from the WRITE_METHODS check — any approved user, including a `viewer`
   and including a battalion-scoped role, can mark anyone's notification read.
3. The unguarded GETs (category A) pass the proxy for any approved **global** user,
   including `viewer` — meaning there is no read separation at the handler level at all.

**Practical conclusion:** the defense holds as long as the proxy succeeds. It is centralized
rather than layered, and it does not live up to the code's own stated invariant
(`lib/auth/permissions.ts`) that the cookie axis is not an authorization axis.

---

## 6. Authorization model

### 6.1 Predicates in `lib/auth/permissions.ts`

#### Taking `AppUser` (authoritative — from the session)

| Signature | Rule |
|---|---|
| `canView(user)` | `status === 'approved'` |
| `canEdit(user)` | `approved` **and** role `super_admin` or `editor`. **Returns false for `editor_battalion`** — deliberately |
| `canManageUsers(user)` | `approved` and `super_admin` |
| `isSuperAdmin(user)` | Identical to `canManageUsers` |
| `isBattalionScoped(user)` | Role is in `BATTALION_SCOPED_ROLES` (independent of status) |
| `getScopedBattalionId(user)` | `battalion_id` for an approved battalion-scoped role, otherwise `null` = no filtering |
| `canEditBattalion(user, battalionId)` | `canEdit` → any battalion; `editor_battalion` → only their own `battalion_id`; otherwise false |
| `canEditAnything(user)` | `canEdit` or approved `editor_battalion`. **Not an authorization check** — affordance display only |
| `canManageCertificationStatus(user)` | Delegates to `canEdit` |
| `canManageRosterEntry(user, battalionId)` | Delegates to `canEditBattalion` — capability and ownership in one call |
| `canManageAnyRoster(user)` | Delegates to `canEditAnything`. **Not an authorization check** |
| `auditRoleOf(user, battalionCode?)` | String for `status_history.changed_by_role`: `battalion:CODE` for a battalion-scoped role, otherwise `"brigade"` |

#### Taking `Role` (the cookie axis — view)

| Signature | Rule |
|---|---|
| `isBrigade(role)` | `role === 'brigade'` |
| `battalionCodeOf(role)` | The part after `battalion:`, or null |
| `canManageCertifications(role)` | `isBrigade(role)` |
| `canApproveRoster(role)` | `isBrigade(role)` |
| `canManageTrainings(role)` | `isBrigade(role)` |
| `canApproveRequests(role)` | `isBrigade(role)` |
| `canSubmitRequest(role, battalionId, codeById)` | Brigade → true; otherwise battalion code match |
| `canRegisterSoldier(role)` | **Always `return true`** — checks nothing |
| `canViewBattalionData(role, code)` | Brigade → true; otherwise code match |

### 6.2 Role × capability matrix

Per the predicates and the enforcement in `proxy.ts` and the handlers:

| Capability | `super_admin` | `editor` | `viewer` | `editor_battalion` | `viewer_battalion` |
|---|---|---|---|---|---|
| View the whole system | Yes | Yes | Yes | No — 4+2 sections | No — 4+2 sections |
| Create/edit certification | Yes | Yes | No | No | No |
| Change certification status | Yes | Yes | No | No | No |
| Attachments | Yes | Yes | No | No | No |
| Registration lock deadline | Yes | Yes | No | No | No |
| Trainings / templates | Yes | Yes | No | No | No |
| Roster — any battalion | Yes | Yes | No | No | No |
| Roster — own battalion | Yes | Yes | No | **Yes** | No |
| New request for own battalion | Yes | Yes | No | **Yes** | No |
| Request status | Yes | Yes | No | No | No |
| Two Forward (write) | Yes | Yes | No | **Yes** (own battalion) | No |
| Gaps — key/nominations | Yes | Yes | No | **Yes** (own battalion) | No |
| Battalion-clerk confirmation | Yes | Yes | No | **Yes** (own battalion) | No |
| Reports (read) | Yes | Yes | Yes | Own battalion only | Own battalion only |
| Weekly PDF export | Yes | Yes | Yes | Own battalion only | Own battalion only |
| Pivot widgets (save/delete) | Yes | Yes | **Yes** | Yes | Yes |
| User management | **Yes** | No | No | No | No |

Note: pivot widgets are deliberately writable by any approved user — `proxy.ts:19–26`
documents this ("shared report configuration that viewers may save/delete too").

### 6.3 Battalion scope enforcement

Three layers:

1. **Navigation** — `lib/auth/nav.ts:navLinksFor(user)` is derived from the authenticated row.
   `navLinksForView` can only **remove** links (it hides `/force-structure` and `/gaps` from
   a brigade view with no battalion selected), so the cookie cannot widen anyone's navigation.
2. **Pages** — `proxy.ts` + `isPathAllowedForScopedRole` (`lib/auth/battalion-scope.ts`).
   `BATTALION_SCOPED_SECTIONS` = `/calendar`, `/requests`, `/battalions`, `/reports`,
   `/force-structure`, `/gaps`. Anything else → redirect to `BATTALION_SCOPED_HOME = "/calendar"`.
3. **API** — `isApiAllowedForScopedRole` with `BATTALION_SCOPED_API_PREFIXES`:
   `/api/me`, `/api/role`, `/api/notifications`, `/api/battalions`, `/api/requests`,
   `/api/reports`, `/api/certification-gaps`, `/api/force-structure`, `/api/gaps`,
   `/api/battalion`, `/api/roster`. Everything else → 403 for a battalion-scoped role.

Inside handlers: `lib/auth/scope.ts` provides `getBattalionScope()` (returns null for a global
role = no filtering), `denyOutOfScope(battalionId)` (**404**, not 403 — "whether a row exists
in another battalion is itself not theirs to learn"), and `requireBattalionEditor(battalionId)`.
`NO_BATTALION_CODE = "__no_battalion__"` guarantees fail-closed behavior if the battalion row
has disappeared.

#### Queries that filter by battalion

| Filtered | Not filtered (by design) |
|---|---|
| `getExportData(from, to, battalionCode)` — `lib/db/repositories/export.ts:62` | `listCertifications()` without `battalionCode` |
| `reports.ts` — all seven reports take `scopedId` | `getGapRowSnapshot` — **returns all battalions** |
| `runPivotReport` — `battalionIds` intersected with scope (`app/reports/pivot/page.tsx:36`) | `listStatusHistory` — no scope |
| `listBattalionAllocations(battalionId, range?)` | `listTemplates`, `listTrainings` (reference data) |
| `getBattalionSummary(battalionId)` | |
| `listRosterForBattalionCertification(certId, battalionId)` | |
| `listComputedGaps(battalionId)`, `listGapKeys(battalionId)` | |
| `listCanvasRoles` / `listBankSoldiers` (per battalion) | |

### 6.4 Places where UI and API disagree

| Location | UI | API |
|---|---|---|
| `canRegisterSoldier(role)` | Always `return true` | The API enforces `canManageRosterEntry(user, battalionId)`. The predicate is meaningless — it misleads anyone reading it as a gate |
| `canApproveRoster(role)` | Still exported and cookie-based | `/api/roster/[entryId]/status` **no longer** uses it (moved to `canManageRosterEntry`). The predicate remains in the code with no purpose |
| `canManageCertifications(role)` | Drives buttons in brigade view | 20 handlers rely on it as a **gate** — see 5.1B |
| `canEditAnything` / `canManageAnyRoster` | Display affordances | Explicitly documented as "NOT AN AUTHORIZATION CHECK" |
| `/certifications/[id]` — registration lock panel | Shown only if `canManageCertifications(role) && canEdit(me)` | `PATCH /api/certifications/[id]` requires `requireEditor` + cookie — consistent |

---

## 7. Validation

38 Zod schemas across 14 files under `lib/validation/`.

| Schema | File | Shape summary | Consumed by |
|---|---|---|---|
| `certificationSchema` | `certification.ts:13` | Base ZodObject: `name`, `start_date`, `end_date`, `location`, `total_slots` (preprocess: `''` → null), `is_unlimited` (UI only, not persisted), `gap_row_id`, `registration_open`, `registration_lock_date` (ISO regex), `registration_lock_hour` (int 0–23), `notes`, `color_hex` (hex regex), `prerequisites[]`, `quotas[]`, `taxes[]` | `POST /api/requests/[id]/open-certification` |
| `certificationCreateSchema` | `certification.ts:90` | `certificationSchema` + superRefine: capacity required unless `is_unlimited`; `checkLockHourHasDate` | `POST /api/certifications` |
| `certificationPatchSchema` | `certification.ts:103` | `.partial()` + the same refinements | `PATCH /api/certifications/[id]` |
| `certificationStatusSchema` | `certification.ts:116` | `status` enum + `note` | `PATCH /api/certifications/[id]/status` |
| `rosterEntrySchema` | `roster.ts:4` | Full soldier | `POST /api/certifications/[id]/roster`, `PATCH /api/roster/[entryId]` |
| `battalionRosterEntrySchema` | `roster.ts:28` | Battalion variant | `/api/battalions/[id]/certifications/[certId]/roster[/[entryId]]` |
| `rosterStatusSchema` | `roster.ts:32` | Status + reason | `PATCH /api/roster/[entryId]/status` |
| `templateSchema` | `template.ts:6` | Template | `POST /api/templates`, `PATCH /api/templates/[id]` |
| `trainingSchema` | `training.ts:16` | Training + sessions | `POST /api/trainings`, `PATCH /api/trainings/[id]` |
| `trainingSessionSchema` | `training.ts:5` | Block | `/api/trainings/[id]/sessions[/[sessionId]]` |
| `requestSchema` | `request.ts:22` | Request + `soldiers[]` | `POST /api/requests`, `PATCH /api/requests/[id]` |
| `requestStatusSchema` | `request.ts:37` | Request status | `PATCH /api/requests/[id]/status` |
| `requestSoldierSchema` | `request.ts:6` **and** `request-soldier.ts:5` | **Defined twice** — see section 11 | `POST /api/requests/[id]/soldiers` (from `request-soldier.ts`) |
| `influencingFactorSchema` | `influencing-factor.ts:3` | Influencing factor | `/api/influencing-factors[/[id]]` |
| `traineeApprovalSchema` | `quota.ts:11` | `battalion_id` | `POST …/approve-trainees` |
| `certificationFileUploadSchema` | `certification-file.ts:35` | `original_name`, `mime_type` enum (PNG/JPEG/WEBP/PDF), `size_bytes` ≤ 4MB | `POST /api/certifications/[id]/files` |
| `certificationFileSchema`, `certificationFileWithUrlSchema` | `certification-file.ts:46,59` | Row/response shape | Types only |
| `pivotQuerySchema` | `pivot.ts:55` | `battalionIds[]`, `certificationIds[]`, range | `POST /api/reports/pivot` |
| `pivotWidgetConfigSchema` | `pivot.ts:62` | Widget config | `app/reports/pivot/page.tsx:37` (validates JSONB on read) |
| `pivotWidgetSaveSchema` | `pivot.ts:65` | `name` + config | `/api/reports/pivot/widgets[/[id]]` |
| `pivotWidgetIdSchema` | `pivot.ts:74` | UUID | `PATCH/DELETE …/widgets/[id]` |
| `pivotReportSchema` | `pivot.ts:114` | Response shape | Types |
| `weeklyExportQuerySchema` | `battalion-export.ts:25` | `from`/`to` ISO + `to >= from` + cap of `MAX_EXPORT_SPAN_DAYS = 31` | `GET /api/battalions/[id]/weekly-export` |
| `battalionIdParamSchema` | `battalion-export.ts:47` | coerce positive int | Same route |
| `userPatchSchema` | `admin.ts:72` | `status`/`role`/`battalion_id` | `PATCH /api/admin/users/[id]` |
| `approveUserSchema`, `updateRoleSchema` | `admin.ts:54,63` | | Admin forms |
| `loginSchema`, `signupSchema`, `resetRequestSchema`, `updatePasswordSchema` | `auth.ts:5,12,31,37` | Auth forms (client-side) | `components/auth/*` |
| `assignmentCreateSchema`, `assignmentMoveSchema`, `bankSoldierSchema`, `soldierCertificationSchema`, `roleSeedSchema` | `force-structure.ts:43,59,69,82,96` | Two Forward | `POST /api/force-structure/assignments/[id]/move` (only `assignmentMoveSchema` is consumed in a route) |

### 7.1 Routes that read a request body with no schema

| Route | What is read unvalidated |
|---|---|
| `POST /api/role` | `const { role } = await request.json()` — manual prefix check only |
| `POST /api/certification-gaps` | `certification_name` — manual presence check |
| `PUT /api/certification-gaps/[rowId]/value` | Body, no schema |
| `PUT /api/certification-gaps/[rowId]/sent` | Body, no schema |
| `PATCH /api/taxes/[taxId]/fulfilled` | Body, no schema |
| `PATCH /api/templates/course/[name]` | Body, no schema |
| `POST /api/certifications/[id]/confirm-completion` | `passedRosterIds` array, no schema |
| `POST /api/requests/[id]/link-certification` | Body, no schema |
| `PUT /api/gaps/[rowId]/key` | Body, no schema |
| `PUT /api/gaps/[rowId]/active-source` | Body, no schema |
| `POST /api/force-structure/bank/[id]/move` | Body, no schema |
| `POST /api/force-structure/edit-session[/[id]/revert]` | Body, no schema |
| `PUT/DELETE /api/roster/[entryId]/admin-confirmation` | Body, no schema |
| `POST/DELETE /api/gaps/[rowId]/nominations` | `createSchema` is **defined locally in the route**, not in `lib/validation/` |

**Needs verification:** I did not confirm that each of these actually calls `request.json()`
rather than relying on query params alone; the list was derived from the absence of a `*Schema`
in the file.

---

## 8. UI map

### 8.1 Pages

40 pages, 9 layouts. `app/layout.tsx` is the shell: RTL, Heebo, `MainNav`, `OpenTasksBar`
(brigade view with no battalion selected only), `Toaster`, `RoleProvider`.

| Path | Purpose | Who sees it |
|---|---|---|
| `/` | `app/page.tsx` — inbound routing | Everyone |
| `/login`, `/signup`, `/reset-password`, `/update-password` | Auth (`AuthCard`: logo + slogan) | Public |
| `/pending` | "Account awaiting approval" | `status !== 'approved'` |
| `/calendar` | Main calendar — four views | Everyone (home for battalion-scoped roles) |
| `/certifications` | Certification list + tabs | Global roles only |
| `/certifications/new`, `/certifications/[id]/edit` | Certification form | `canEdit` |
| `/certifications/[id]` | Certification detail: KPIs, taxes, registration panel + lock countdown, roster, reserve, files, history | Global |
| `/certifications/[id]/print` | Print view | Global |
| `/certifications/[id]/roster/new`, `/[entryId]/edit` | Soldier form | `canManageRosterEntry` |
| `/trainings`, `/trainings/new`, `/trainings/[id]`, `/[id]/edit` | Trainings + blocks | Global |
| `/templates`, `/templates/new`, `/templates/[id]/edit`, `/templates/course/[name]` | Certification bank (grouped by course name) | Global |
| `/requests`, `/requests/new`, `/requests/[id]` | Battalion requests + gap matrix relative to assignments | Everyone (battalion-scoped sees its own) |
| `/battalions` | Battalion index (routes a battalion-scoped role to its own) | Everyone |
| `/battalions/[code]` | Battalion dashboard: KPIs, allocations awaiting names, weekly board + PDF export, establishment, battalion-clerk confirmation | Own battalion / global |
| `/battalions/[code]/certifications/[certId]` | The certification from the battalion's angle: its allocation, its soldiers, countdown | Own battalion / global |
| `/force-structure` | "Two Forward" — establishment/assignment canvas | Battalion-scoped + global with a battalion selected |
| `/force-structure/pending-identity` | Awaiting personal number/name | Same audience |
| `/gaps` | Gaps: computation key, active source, nominations | Same audience |
| `/reports` | Summary report + Excel/PDF export | Everyone (filtered) |
| `/reports/other` | Six report tables + Excel export per table | Everyone (filtered) |
| `/reports/pivot` | "Certification pivot" + saved widgets | Everyone (filtered) |
| `/reports/battalion-roster` | Soldiers by certification and battalion + Excel | Everyone (filtered) |
| `/notifications` | Notifications | Everyone |
| `/admin/permissions` | User management | `super_admin` only |

### 8.2 Navigation

`lib/auth/nav.ts` — `NAV_LINKS` in display order: `/calendar` (Calendar), `/trainings`
(Trainings), `/certifications` (Certifications), `/requests` (Battalion Requests),
`/templates` (Certification Bank), `/battalions` (Battalions), `/force-structure`
(Two Forward), `/gaps` (Gaps), `/reports` (Reports). `ADMIN_LINK` = `/admin/permissions`
is appended for `super_admin`.

`BATTALION_ONLY_LINKS = ["/force-structure", "/gaps"]` — hidden from brigade view with no
battalion. `pointBattalionsAtOwn` redirects "Battalions" straight to a battalion-scoped
user's own battalion.

`RoleSwitcher` (`components/layout/role-switcher.tsx`) calls `POST /api/role`.

### 8.3 Calendar views

`components/calendar/`: `month-view.tsx`, `week-row.tsx` (weekly), `agenda-view.tsx`,
`gantt-view.tsx`, `year-gantt-view.tsx`. `calendar-client.tsx` is the orchestrator;
`filter-bar.tsx` handles filtering.

`CalendarItemKind` (`components/calendar/types.ts:31`) = `certification` | `training` |
`influencing_factor`. `calendarSortPriority` gives `influencing_factor` priority 0
(displayed first).

**What is shown and what is not:** `app/calendar/page.tsx:28` filters
`c.status !== "cancelled"` — cancelled certifications are **not** on the calendar. Trainings
and influencing factors are shown with no status filter (they have no status). For a
battalion-scoped role, a certification's `href` is redirected to
`/battalions/{code}/certifications/{id}` because the certifications section is not theirs.

### 8.4 Timezone handling

Single source of truth: `lib/utils/registration-lock.ts:33` — `APP_TIME_ZONE = "Asia/Jerusalem"`.

- `todayIsoDate(now?)` — `'yyyy-MM-dd'` on Israel time via `Intl.DateTimeFormat("en-CA")`.
- `zoneOffsetMsAt(instant)` — the actual UTC offset at that instant, derived from `Intl`
  (not a hardcoded rule), so DST transitions come from the platform's tz database.
- `zonedWallClockToInstant(y,m,d,h)` — two passes: treats the wall clock as if it were UTC,
  subtracts the offset, then corrects again using the offset **at the answer**. The two
  ambiguous hours per year resolve deterministically and are documented: spring forward
  (02:00 which does not exist) → 03:00; fall back (01:00 twice) → the **second** occurrence.
- `lib/calendar/anchor.ts` — "today" is resolved **on the server** and passed to the client
  as a prop, so the server HTML and the browser's first render match
  (`app/calendar/page.tsx:62`, `components/calendar/calendar-client.tsx:34`).
- PDF export stamps `generatedAt` on Israel time and says so in the text
  (`app/api/battalions/[id]/weekly-export/route.ts:20`).
- Dates are stored as TEXT `'yyyy-MM-dd'`, so lexicographic comparisons **are** chronological
  comparisons — no parsing, no timezone in the middle.

### 8.5 `components/` areas

| Directory | Contents |
|---|---|
| `ui/` | shadcn/Radix base: `button`, `input`, `table`, `card`, `tabs`, `alert-dialog`, `collapsible`, `dropdown-menu`, `checkbox`, `label`, `textarea`, `sonner`, `date-range`, `kpi-card`, `color-select`, `time-combobox`, `badge` |
| `layout/` | `main-nav` (branding + navigation + slogan), `role-switcher`, `open-tasks-bar`, `chrome-gate` |
| `certifications/` | `certification-form`, `certifications-list-tabs`, `status-changer`, `status-badge`, `quota-registration-panel` (lock editor + countdown), `registration-lock-countdown`, `certification-files`, `certification-files-list`, `confirm-completion-panel`, `tax-list`, `delete-certification-button`, `slot-status-indicator`, `print-button` |
| `roster/` | `roster-table` (with per-row copy), `roster-form`, `copy-roster-button` |
| `battalions/` | `battalion-dashboard`, `battalion-summary`, `battalion-roster-panel`, `soldier-search` |
| `calendar/` | The five views + `filter-bar` + `certification-chip` + `types` |
| `reports/` | `export-report-actions`, `export-report-body`, `export-excel-button`, `battalion-roster-report`, `pivot-*` |
| `force-structure/` | `force-structure-screen` (canvas) and companions |
| `gaps/` | `gaps-screen` |
| `requests/`, `trainings/`, `templates/`, `influencing-factors/`, `admin/`, `auth/`, `audit/`, `notifications/`, `colors/` | Domain forms and screens |

---

## 9. Domain rules encoded in code

### 9.1 Certification status transition map

Source of truth: `lib/certifications/transitions.ts:21` — `VALID_TRANSITIONS`.

| From | To |
|---|---|
| `draft` | `open`, `cancelled` |
| `open` | `full`, `closed`, `in_progress`, `cancelled` |
| `full` | `open`, `closed`, `in_progress`, `cancelled` |
| `closed` | `open`, `in_progress`, `cancelled` |
| `in_progress` | `completed`, `cancelled` |
| `completed` | — (terminal) |
| `cancelled` | — (terminal) |

Enforced in `lib/db/repositories/certifications.ts:253`; also consumed by
`components/certifications/status-changer.tsx` via `allowedTransitionsFrom`, so the buttons
the UI offers and the transitions the server accepts are the same map.
`OPEN_FOR_REGISTRATION = "open"` is marked separately as the primary action.

#### ★ A path that bypasses the map

`confirmCertificationCompletion` (`lib/db/repositories/certifications.ts:333`) writes
`status = 'completed'` **directly**, without consulting `VALID_TRANSITIONS`. It only checks
that the status is not already `completed`/`cancelled`. The comment at
`lib/certifications/transitions.ts:15–19` documents this explicitly: nine `draft -> completed`
rows exist in `status_history` even though `draft` only permits `open`/`cancelled`. It is
flagged there as a known, deliberate inconsistency.

Request transitions: a **second, separate** map at `lib/db/repositories/requests.ts:104`
(not exported): `opened → in_review|rejected`; `in_review → approved|rejected|opened`;
`approved → certification_opened|closed`; `rejected → closed`;
`certification_opened → closed`; `closed → —`.

### 9.2 Per-soldier completion vs. certification-level status

Two **separate** levels:

- **Soldier level**: `roster_entries.status` — `passed` / `failed` are the binding statement.
- **Certification level**: `certifications.status = 'completed'` means the cycle closed,
  **not** that a particular soldier passed.

`confirmCertificationCompletion` is the bridge: it takes `passedRosterIds`, marks every row
not on the list as `failed`, then closes the certification. It operates **only on
`is_reserve = 0`** (`certifications.ts:303`).

`lib/db/repositories/certification-pivot.ts:59` states explicitly: "The certification's own
status is never [used]" — the report relies on soldier status alone. **No place was found
that infers soldier state from certification status.**

### 9.3 Reserve (עתודה) — where counted and where not

| Location | Treatment |
|---|---|
| `ACTIVE_ROSTER_STATUSES` + `is_reserve = 0` | **Excluded** from occupancy and capacity |
| `ALLOCATION_OPPORTUNITIES_SQL` (`battalion-dashboard.ts:193`) | **Excluded from both counts** — comment: "a reserve soldier occupies no seat, so a cycle whose only names are reserve still has every seat open" |
| `countBattalionQuotaUsage` (`roster.ts:258`) | `is_reserve = 0` only |
| `confirmCertificationCompletion` | `is_reserve = 0` only |
| `listReserveForCertification` | Separate list (`is_reserve = 1`) |
| `getBattalionQuotaUsage` | `reserve` returned as a separate field, not deducted from capacity |
| **Pivot report** | **Included** — `lib/reports/pivot-counting-rule.ts:71`: `is_reserve` is **not** checked; a reserve row goes through the same status test. `reserve_count` is reported **in parallel**, overlaps all three buckets, and is never summed with them |
| `battalion-dashboard.tsx:95` (`countedNames`) | `is_reserve === 0 && ACTIVE_ROSTER_STATUSES.includes(status)` |
| WhatsApp copy | `is_reserve` is **not** mapped to "reserve/regular service" — `lib/roster/copy-format.ts` documents that these are different concepts |

### 9.4 Capacity, occupancy, and allocation

`lib/utils/slots.ts`:
- `computeSlotsRemaining(totalSlots, registeredCount)` → `null` if `totalSlots === null`
  (unlimited), otherwise `max(total - registered, 0)`.
- `ACTIVE_ROSTER_STATUSES = ['registered','pending_approval','approved','participated','passed','failed']`
  — note that `failed` **occupies a seat** (they attended), while
  `rejected`/`did_not_participate`/`did_not_report` do not.

Consumers of the constant: `certifications.ts:26`, `open-tasks.ts:36,55`, `roster.ts:258`,
`battalion-summary.ts:100`, `battalion-dashboard.ts:31` (as `COUNTED_STATUSES`),
`battalion-dashboard.tsx:95`.

`lib/battalions/open-allocations.ts`:
- `remainingAllocatedSlots(allocated, registered)` → `null` when there is no allocation
  (**not** 0 — the comment explains that 0 would make an unallocated certification look full).
- `isOpenAllocation(row)` — status in `OPEN_ALLOCATION_STATUSES = ['open','full','in_progress']`,
  `allocated_slots` non-null and not ≤ 0, and seats remaining.
- `openAllocationsOf` narrows the type to non-null after filtering.
- `isAwaitingNames({has_quota, registered})` — `has_quota && registered === 0`, the amber state.

`lib/db/repositories/roster.ts:eligibilityOf` + `ELIGIBILITY_SQL:315` — **the shared
eligibility statement** used by both `getBattalionQuotaUsage` (which renders the panel) and
`addBattalionRosterEntry` (which authorizes the write), "so the button and the endpoint cannot
disagree about whether a seat exists". Two modes: `mode = 'open_to_all'` (no battalion holds
an allocation → the pool is `total_slots`) or `'battalion_quota'` (some allocation exists →
the battalion's own allocation is counted).

`listBattalionAllocations` includes a certification if **either** a
`certification_battalion_quotas` row exists for the battalion **or** a `roster_entries` row
of theirs exists. Deduplication is structural (UNIQUE on the pair + a grouped subquery),
not `DISTINCT`.

### 9.5 Registration lock

`lib/utils/registration-lock.ts` — `registration_lock_date` + `registration_lock_hour`
resolve to a single **instant**:
- `hour = H` → closes at H:00 Israel time on that date.
- `hour = NULL` → end of the lock day (hour 24) = pre-022 semantics. This is why 022 needed
  no backfill.
- The boundary is **inclusive**: `now >= moment` = locked.
- `isRegistrationLocked(lock, now)` returns `false` when there is no deadline — "the absence
  of a deadline must never read as a passed one".

Server-side enforcement: `roster.ts:174` (`addRosterEntry`), `roster.ts:322`
(`addBattalionRosterEntry`, inside the same transaction as the INSERT and with `FOR UPDATE`
on the allocation row), and
`app/api/certifications/[id]/quotas/[battalionId]/approve-trainees/route.ts:51`.
`REGISTRATION_LOCKED_MESSAGE` — a single refusal wording.

### 9.6 Gap computation (פערים)

Source: VIEW `v_certification_gaps` (`migrations/postgres/015_gap_requirement_keys.sql:258`).

- **required** = `SUM(gap_requirement_keys.qty × v_org_unit_counts.unit_count)` for the active
  `active_source`. The `COALESCE` sits **inside** the `SUM` deliberately — outside it, a
  single unmatched `unit_type` would zero out an addend and under-report.
- **held** = `COUNT(DISTINCT soldier_certifications.personal_number)` intersected with that
  battalion's `role_assignments` (via `roles` → `companies`). DISTINCT so that a soldier on
  two posts counts once.
- **active_source** = `COALESCE(certification_gap_values.active_source, certification_gap_rows.active_source)`,
  one of `'operational'` / `'establishment'`.
- Only battalions with `is_active = 1`.

**When it updates:** the VIEW is computed live on every read. In addition,
`confirmCertificationCompletion` (`certifications.ts:318`) manually decrements
`certification_gap_values.gap_count` by `GREATEST(gap_count - passedCount, 0)` per battalion,
**only if** `certifications.gap_row_id` has a value, and **only** for explicit `passed` status.

`GAP_BATTALION_CODES` (`certification-gaps.ts:151`) = `["5030","8207","9308","6228","gdsm","hq"]` —
a hardcoded constant that determines the battalion axis of the `/requests` matrix.

### 9.7 Pivot report — counted vs. excluded

Source of truth: `lib/reports/pivot-counting-rule.ts`. **Three buckets, not two.**

| Constant | Values |
|---|---|
| `COUNTED_ROSTER_STATUSES` | `approved`, `registered`, `passed`, `participated` |
| `EXCLUDED_ROSTER_STATUSES` | `failed`, `did_not_report`, `did_not_participate` |
| `unrecognized` | Everything else: NULL, empty string, legacy value — **never counted** |

The file states explicitly that this is **not** the system-wide rule:
`ACTIVE_ROSTER_STATUSES` in `lib/utils/slots.ts` remains the rule for occupancy and allocation
math, and the gap mechanism decrements only on explicit `passed`. Neither of them imports from
`lib/reports/pivot-counting-rule.ts`, and the module is placed under `lib/reports/` and named
after the report **deliberately**: "a generic name in a generic folder is how a report-specific
rule ends up silently governing capacity math".

Note: `failed` **is counted** in `ACTIVE_ROSTER_STATUSES` (occupies a seat) but **is excluded**
in the pivot report. This is a deliberate, documented mismatch between the two rules.

`PIVOT_COUNT_LABELS` — "נספרו"/"לא נספרו" (counted / not counted, rather than "completed"),
because the counted bucket includes in-progress statuses. Denominator:
`total_count = counted + excluded + unrecognized`, reserve included. `reserve_count` overlaps
and is not part of the partition. Consumers: `lib/db/repositories/certification-pivot.ts`,
`components/reports/pivot-*`, `tests/reports/pivot-counting-rule.test.ts`,
`tests/reports/pivot-summary.test.ts`.

### 9.8 Notification triggers

`createNotification` is called from 8 places:

| Location | Trigger | `type` | `target_role` |
|---|---|---|---|
| `certifications.ts:269` | Status change to `open`/`closed`/`cancelled`/`completed` | `certification_changed` / `registration_closed` / `certification_cancelled` | `battalion:all` |
| `certifications.ts:337` | Certification completion confirmed | `certification_changed` | `battalion:all` |
| `requests.ts:74` | Request created | — | brigade |
| `requests.ts:206` | Certification opened from a request | `opened_from_request` | — |
| `roster.ts:230` | Soldier added | `soldier_added` | — |
| `roster.ts:536` | Soldier status change | `soldier_approved` / `soldier_rejected` | — |
| `roster.ts:584` | `approveTraineeList` | — | — |
| `users.ts:58` | New user signup | `user_registered` | `SUPER_ADMIN_NOTIFICATION_ROLE` |

**Needs verification:** I did not decompose each of the eight into its exact
`type`/`target_role` values; four were inferred from context rather than read in full.

### 9.9 Writes to `status_history`

`recordStatusChange(entityType, entityId, oldStatus, newStatus, changedByRole, note?, client?)`
(`lib/db/repositories/audit.ts`). `entity_type` is one of `'certification'`,
`'battalion_request'`, `'roster_entry'` (`lib/types.ts:102`).

Called from: `certifications.ts` (creation, status change, completion confirmation — including
one row per roster entry), `requests.ts` (request status change), `roster.ts` (soldier status
change, `approveTraineeList`).

`changed_by_role` — the value comes from `auditRoleOf(user, battalionCode)` in the hardened
routes (producing `"brigade"` or `"battalion:CODE"` from the authenticated row), but in
cookie-based routes it still comes from `getCurrentRole()`. `auditRoleOf` documents that the
column already holds 707 `"brigade"` rows, so the vocabulary is preserved.

---

## 10. Reports and exports

| Report | Page | Data source | Filters | **Missing** filters | Export |
|---|---|---|---|---|---|
| Certification & training summary | `/reports` | `getExportData(from, to, scope?.code)`, `getTrainingExportData` | Date range; battalion (**forced** for battalion-scoped roles) | Certification status, domain, battalion as a choice for global roles | Excel (`export-report-actions.tsx:91`) + PDF (`exportElementToSinglePagePdf`) |
| Six report tables | `/reports/other` | `reports.ts`: `certificationsByMonth`, `openForRegistration`, `completedCertifications`, `openRequestsByBattalion`, `gapsByBattalion`, `rosterCounts` | Battalion (forced for battalion-scoped, `scopedId`) | **No date range, no status filter, no battalion selection for global roles** | Excel per table (`export-excel-button.tsx`), English filenames: `certifications_by_month`, `open_for_registration`, `completed_certifications`, `open_requests_by_battalion`, `gaps_by_battalion`, `roster_counts` |
| Certification pivot | `/reports/pivot` | `runPivotReport` (`certification-pivot.ts`) | Battalions, certifications, date range; saved widgets | Domain as a primary filter (`listDomainsWithCertifications` exists as a helper) | Via `pivot-*` components |
| Soldiers by certification and battalion | `/reports/battalion-roster` | `battalionRosterReport` | Battalion (forced for battalion-scoped, selectable for global, default = all battalions) | Date range, status | Excel — `חיילים_לפי_הסמכה_וגדוד.xlsx` (`battalion-roster-report.tsx:117`) |
| Weekly battalion update | `/battalions/[code]` (button) | `listBattalionAllocations(id, {from,to})` + `listAllocationOpportunities` | Displayed week, battalion from the path | — | **Server-side PDF** — `GET /api/battalions/[id]/weekly-export` |
| Certification roster export | `/certifications/[id]/print` | `getCertificationById` + roster | — | — | Print/PDF |
| Annual Gantt | `/calendar` (year view) | `calendarItems` | Year | — | PDF — `גאנט_חטיבה_228_${year}.pdf` (`year-gantt-view.tsx:86`) |

### 10.1 Hebrew RTL and fonts in exports

**Excel** — `xlsx@^0.18.5`, loaded dynamically (`await import("xlsx")`) in every consumer.
`XLSX.utils.json_to_sheet` with Hebrew keys; the sheet name is Hebrew
(`battalion-roster-report.tsx:120`). **No font or RTL handling** — Excel determines
directionality from cell content and user settings. There is no `!cols` / `!dir` anywhere.

**PDF — two entirely different paths:**

1. **Client-side (raster)** — `lib/utils/export-pdf.ts` + `lib/utils/pdf-capture.ts` +
   `html2canvas-pro` + `jspdf`. It captures the real DOM, so Hebrew and RTL are **correct by
   virtue of the browser having rendered them**. No font embedding. Used by `/reports`, the
   annual Gantt, `battalion-roster-report`, `export-report-body`. These components carry
   `eslint-disable-next-line @next/next/no-img-element` — a manual `<img>` is required because
   `next/image` is not captured by html2canvas.

2. **Server-side (vector)** — `lib/pdf/weekly-certifications.ts`. jsPDF with **Heebo embedded**:
   `lib/pdf/fonts/heebo-regular.ts` + `heebo-bold.ts`, base64 TTF (~57KB and 58KB), generated
   by `scripts/make-pdf-fonts.mjs`. The choice of base64 inside a module (rather than reading
   a file) is documented: an import is a hard dependency the bundler cannot miss, whereas
   `fs.readFile` on `public/fonts` depends on file tracing.

   **Two things hold Hebrew together there:**
   - Font embedding — the 14 standard PDF fonts have no Hebrew glyphs at all.
   - `doc.setR2L(true)` — invokes jsPDF's bidi engine and produces visual order. `drawRight()`
     toggles the flag **per string**, because the bidi engine reverses a run containing no
     strong RTL character: a cell holding only `"24.08.2026"` renders as `"6202.80.42"`.
     Documented fix, backed by a test.

   The `Content-Disposition` filename includes both an ASCII `filename` **and**
   `filename*=UTF-8''` (RFC 5987), because a Hebrew name in the plain parameter is mangled by
   some clients.

---

## 11. Known issues, tech debt, and risks

Ranked by severity.

| # | Issue | Evidence | Impact | Suggested fix scope |
|---|---|---|---|---|
| 1 | **20 handlers authorize from the `active_role` cookie only**, and `POST /api/role` lets anyone set it | `app/api/role/route.ts`; `app/api/{certifications,templates,trainings,taxes,certification-gaps,requests}/…` — full list in 5.1B | Authorization based on a client-controlled value. In practice blocked by `proxy.ts`, but that is a single point of failure | Add `requireEditor()`/`requireApprovedUser()` at the top of each handler; keep the cookie check as scope. The pattern already exists in `requireCertificationManager` |
| 2 | **The proxy's role-enforcement block is wrapped in a `try/catch` that silently continues** | `proxy.ts:60` (`try`) through `:131` (`catch { }` with "Best-effort gate; fall through and let page/handler guards enforce") | A DB fault/timeout in `getUserById` disables role enforcement for all requests; the 29 handlers from 5.1 have no guard of their own | Fail closed: return 503 instead of continuing, or at minimum for `WRITE_METHODS` and `/api/admin` |
| 3 | **9 handlers with no guard at all** | `app/api/audit/route.ts`, `app/api/certification-gaps/[rowId]/snapshot/route.ts`, `app/api/notifications/[id]/read/route.ts`, `app/api/role/route.ts`, `app/api/certifications/route.ts:14`, `app/api/certifications/[id]/route.ts:45`, `app/api/templates/route.ts:7`, `app/api/templates/[id]/route.ts:7`, `app/api/trainings/route.ts:7`, `app/api/trainings/[id]/route.ts:13` | Unchecked reads at the handler level; `snapshot` returns **all** battalions' data | `requireApprovedUser()` on each; add `denyOutOfScope` or scope filtering to `snapshot` |
| 4 | **`PATCH /api/notifications/[id]/read` is also exempt from the proxy** | `app/api/notifications/[id]/read/route.ts`; `proxy.ts:22–27` (`API_ALLOW_ANY` includes `/api/notifications`) | Any approved user, including a `viewer` and including a battalion-scoped role, can mark anyone's notification read | Verify ownership: cross-check `notifications.target_role` against the caller's scope |
| 5 | **`confirmCertificationCompletion` bypasses the transition map** | `lib/db/repositories/certifications.ts:333`; documented at `lib/certifications/transitions.ts:15–19` | Nine `draft -> completed` rows exist in `status_history`. Inconsistent status, and the map is not the only rule | A deliberate decision is needed: either route it through the map (and check which confirmations would be rejected), or add an explicit `draft -> completed` transition |
| 6 | **N+1 on three hot paths** | `lib/db/repositories/export.ts:67` (5N), `app/calendar/page.tsx:35,41,45`, `app/reports/pivot/page.tsx:36` (a full report per widget) | The calendar is the de facto home page; `/reports` feeds the exports. Query count grows linearly with the number of certifications | One grouped query with `certification_id = ANY($1)` — the pattern was already fixed in `listBattalionAllocations` |
| 7 | **`certifications.status`, `battalion_requests.status`, `users.status`, `notifications.type` have no CHECK** | `migrations/postgres/001_init.sql:47,109,119`; `004_users.sql` | The problem migration 023 fixed for `roster_entries.status` still exists on four more columns. A row with a foreign value is not blocked | A new migration following the 023 pattern (pre-check + EXCEPTION, no guessing) |
| 8 | **`canRegisterSoldier(role)` always returns `true`** | `lib/auth/permissions.ts` (end of file) | A predicate that looks like a gate and guards nothing. Anyone calling it assuming it checks something gets no error | Delete it, or replace with `canManageRosterEntry(user, battalionId)` |
| 9 | **`canApproveRoster(role)` is now dead** | `lib/auth/permissions.ts`; `app/api/roster/[entryId]/status/route.ts:12` mentions it only in a comment as the previous gate | Dead code that looks live; invites incorrect reuse | Delete |
| 10 | **`requestSoldierSchema` is defined twice** | `lib/validation/request.ts:6` and `lib/validation/request-soldier.ts:5` | Two shapes for the same entity; one can drift from the other | Merge them, keep a single export |
| 11 | **14 handlers read a request body with no Zod schema** | Full list in 7.1 | Unvalidated input reaches the repository; no consistent 400 | A schema for each in `lib/validation/` |
| 12 | **`createSchema` defined inside a route** | `app/api/gaps/[rowId]/nominations/route.ts` | Breaks the structure — every other schema lives in `lib/validation/` | Move to `lib/validation/` |
| 13 | **Two dead tables** | `system_settings` **[017]** (zero references); `certification_gap_snapshots` **[018]** (documented "DELIBERATELY UNWIRED") | Schema that promises a capability that does not exist. The trend chart (§1.6 in the spec) is not wired | Either wire them or remove them in a new migration; document the choice |
| 14 | **Abandoned SQLite migration series at the `migrations/` root** | `migrations/0001_init.sql`, `0002_add_battalions_and_taxes.sql`, `0003_reserve_and_hq.sql` vs. `scripts/migrate-postgres.ts:15`, which reads only from `migrations/postgres/` | Three files that look like active migrations and are never run. Confusion risk for anyone joining | Move to `migrations/legacy-sqlite/` + README |
| 15 | **`.env.example` contains a real project URL** | `.env.example` — `NEXT_PUBLIC_SUPABASE_URL="https://lwhxfjdwbwfxdnpilgeo.supabase.co"` | Project identifier exposed in the repo. The anon key itself is a placeholder, and the URL is not a secret in itself (it is shipped to the browser), but it does not belong in an example file | Replace with a placeholder |
| 16 | **`PROJECT_OVERVIEW.md` describes a stale permission model** | `PROJECT_OVERVIEW.md:11–17` ("two kinds of users", the role switcher as the permission mechanism) vs. `lib/types.ts:110` (five roles) and `lib/auth/permissions.ts` | A new reader will conclude the cookie is the authorization axis | Update; point to this document |
| 17 | **`getCurrentRole()` defaults to `"brigade"`** | `lib/auth/current-role.ts` — missing/invalid cookie → `"brigade"` | Fail-**open** toward the most permissive role. Especially harmful combined with risk 1 | A safe default, or return `null` and force the caller to decide |
| 18 | **A meaningless `NODE_ENV` branch** | `lib/db/client.ts:22–27` — `if (NODE_ENV !== "production") { global.__pgPool = pool } else { global.__pgPool = pool }` — both branches identical | Misleading code; appears to have different production behavior and does not | Simplify to one line |
| 19 | **`shadcn` in dependencies rather than devDependencies** | `package.json` — `"shadcn": "^4.13.0"` under `dependencies` | The CLI enters the production bundle for no reason | Move to devDependencies |
| 20 | **`next.config.ts` is empty** | `next.config.ts` | No `outputFileTracingIncludes`. Harmless today (PDF fonts are base64 inside a module), but any future asset read from `fs` at runtime will fail silently on Vercel | Add when needed; document the dependency |
| 21 | **`certifications.origin_request_id` has no FK** | `migrations/postgres/001_init.sql:49` — `origin_request_id INTEGER` with no `REFERENCES` | Can point at a deleted request. Comparable columns are constrained | Add an FK with `ON DELETE SET NULL` |
| 22 | **`battalion_request_soldiers` vs. `roster_entries` — two models for the same thing** | `008_request_soldiers_and_registration_lock.sql` created the table; `011_roster_request_link.sql` states "request-stage soldiers live in the existing `roster_entries` table" | Two possible homes for a request-stage soldier. `request-soldiers.ts` and `roster.ts:addRequestRosterEntries` both exist | Pick one source of truth and document it; 008 may be de facto obsolete |

### 11.1 Results of the requested greps

| Pattern | Occurrences |
|---|---|
| `TODO` | **0** |
| `FIXME` | **0** |
| `HACK` / `XXX` | **0** |
| `@ts-ignore` | **0** |
| `@ts-expect-error` | 1 — `tests/roster/copy-format.test.ts:214`, legitimate use (proves a type is rejected) |
| `eslint-disable` | 5 — `lib/db/client.ts:4` (`no-var` for the pool singleton) and 4× `@next/next/no-img-element` in `components/calendar/year-gantt-view.tsx:125`, `app/requests/page.tsx:95`, `components/reports/export-report-body.tsx:159`, `components/reports/battalion-roster-report.tsx:202` — all required for html2canvas |
| `as any` / `: any` in routes | **0** |
| `as unknown as` | 1 — `app/api/battalions/[id]/weekly-export/route.ts:117` (`pdf as unknown as BodyInit`), a legitimate type workaround in Next |
| `active_role` / `getCurrentRole` | See 5.1 — 20 handlers authorize through it |

The codebase is unusually clean with respect to classic debt markers: explanatory comments
document decisions and known inconsistencies (e.g. the transition-map bypass) instead of
leaving `TODO`s behind.

### 11.2 Tests

19 test files under `tests/`: `auth/` (2), `battalions/` (5), `calendar/` (1),
`certifications/` (2), `db/` (1), `force-structure/` (3), `gaps/` (2), `reports/` (2),
`roster/` (1). `tests/db/status-parity.test.ts` connects to a real database.

There are no tests for: authorization on the cookie-based routes,
`confirmCertificationCompletion`, the proxy layer, or the Zod schemas for
requests/templates/trainings.

---

## 12. Open questions / needs verification

1. **Actual database contents** — no query was run. Cannot verify: how many `roster_entries`
   rows hold an unrecognized status (the pivot's `unrecognized` bucket), whether migration 023
   actually passed in production, whether any leftover
   `certification_battalion_quotas.registration_lock_at` rows exist, and the real distribution
   of `users.role`.
2. **The nine `draft -> completed` rows** — the comment at
   `lib/certifications/transitions.ts:16` cites this number. Not verified against
   `status_history`.
3. **Whether migrations 022/023/024 have run in production** — the runner is idempotent, but
   there is no `schema_migrations` table, so there is no way to know from the code what has
   been applied.
4. **The exact `type` and `target_role` for four notification triggers** — `requests.ts:74`,
   `requests.ts:206`, `roster.ts:230`, `roster.ts:584` were not read in full (section 9.8).
5. **Which of the 14 schema-less handlers actually call `request.json()`** — the list in 7.1
   was derived from the absence of a `*Schema` in the file, not from reading each function body.
6. **`components/**` was not scanned at the leaf level** — per instruction it was summarized
   by area. There may be permission checks or domain logic inside components not captured here.
7. **`system_settings`** — was it intended for the registration-close window (§1.7 in the spec)
   and abandoned, or is it reserved for future use? Intent is not derivable from the code.
8. **`org_unit_type_patterns` / `org_unit_type_members`** — in use via VIEWs. I did not verify
   that every defined pattern actually matches real data (`uses_manual_unit_count` in the VIEW
   suggests there are fallbacks to manual).
9. **`certification_aliases`** — mentioned in `lib/import/`. Unclear whether
   `kind = 'quarantine'` is enforced at runtime or only during import.
10. **Supabase Storage authorization sources** — `lib/storage/*` uses service_role. I did not
    check whether the `certification-files` bucket has RLS policies configured on the Supabase
    side (outside the repo).
11. **The actual `.env.local`** — not read (contains secrets). Section 2 is based on
    `.env.example` and on `process.env` references in the code.