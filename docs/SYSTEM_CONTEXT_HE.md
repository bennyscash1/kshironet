# כשירונט (Kshironet) — מסמך הקשר מערכת

מסמך זה נוצר מקריאת הקוד בלבד (audit קריאה-בלבד). כל טענה מסומנת בקובץ שממנו נלקחה.
במקומות שבהם התיעוד הקיים (`PROJECT_OVERVIEW.md`, `README.md`) חולק על הקוד — **הקוד קובע**,
וההפרש מצוין במפורש. מה שלא ניתן לקבוע מהקוד מסומן תחת "דרוש אימות".

מזהים טכניים (שמות טבלאות, עמודות, נתיבים, פונקציות, מחרוזות תפקידים, ערכי enum) מופיעים
באנגלית בדיוק כפי שהם בקוד.

---

## 1. Overview

מערכת פנימית לניהול **הסמכות וקורסים** ברמת חטיבה (חטיבה 228). היא מרכזת את מחזור החיים
המלא: דרישת גדוד לקורס, פתיחת הסמכה, הקצאת מקומות לגדודים, שיבוץ חיילים, מעקב מקומות פנויים,
נעילת הרשמה, אישור מי עבר, וחישוב פערי הסמכות מול מבנה הכוח.

השם והסלוגן מוגדרים במקום אחד: `lib/config/app.ts` — `APP_NAME = "כשירונט"`,
`APP_SLOGAN = "כשירות בזמן אמת"`, `APP_NAME_EN = "Kshironet"`, `BRIGADE_LABEL = "228"`.

הממשק כולו עברית RTL (`app/layout.tsx`: `<html lang="he" dir="rtl">`, גופן Heebo,
`Direction.DirectionProvider dir="rtl"` מ-radix-ui).

### שני צירי הרשאות — קריטי להבנת המערכת

הקוד מפריד בין **שני צירים בלתי תלויים**, וזו נקודת הבלבול המרכזית במערכת:

| ציר | מקור | סוג | ערכים |
|---|---|---|---|
| **הרשאה אמיתית** (privilege) | טבלת `users` דרך ה-session המאומת של Supabase | סמכותי | `super_admin`, `editor`, `viewer`, `viewer_battalion`, `editor_battalion` |
| **תצוגה** (view scope) | cookie בשם `active_role` | **בורר תצוגה בלבד — ניתן לזיוף** | `brigade` או `battalion:<code>` |

`lib/types.ts:110` מגדיר `UserRole` — חמשת התפקידים האמיתיים. `lib/types.ts:104` מגדיר
`Role = "brigade" | \`battalion:${string}\`` — ציר התצוגה.

`lib/auth/permissions.ts` מתעד זאת במפורש: הפונקציות שמקבלות `AppUser` הן "the authoritative
gate", והפונקציות שמקבלות `Role` הן "a view-scope selector". שם ה-cookie: `lib/auth/constants.ts`.

**`POST /api/role` (`app/api/role/route.ts`) קובע את ה-cookie ללא כל בדיקת הרשאה** — כל
בקשה יכולה להגדיר `active_role` לכל ערך תקין. זו הסיבה שכל route שמאשר על בסיס ה-cookie
נחשב לא-מאובטח (סעיף 5).

### דרגות משתמש בפועל

| תפקיד | קריאה | כתיבה | היקף |
|---|---|---|---|
| `super_admin` | הכל | הכל + ניהול משתמשים | כל החטיבה |
| `editor` | הכל | הכל, למעט ניהול משתמשים | כל החטיבה |
| `viewer` | הכל | אין | כל החטיבה |
| `editor_battalion` | הגדוד שלו | הגדוד שלו בלבד | `users.battalion_id` |
| `viewer_battalion` | הגדוד שלו | אין | `users.battalion_id` |

מצבי משתמש (`lib/types.ts:136`): `pending`, `approved`, `rejected`. משתמש שאינו `approved`
מנותב ל-`/pending` (`proxy.ts`).

**פער תיעוד:** `PROJECT_OVERVIEW.md` מתאר "שני סוגי משתמשים" — חטיבה וגדוד — ומציג את
מחליף התפקיד כמנגנון ההרשאות. **הקוד מגדיר חמישה תפקידים אמיתיים** בטבלת `users`, ומחליף
התפקיד הוא בורר תצוגה בלבד. התיעוד מיושן.

### יעד פריסה

Vercel, אזור `dub1` (`vercel.json`). מסד נתונים: Supabase Postgres דרך `pg` ישירות
(אין ORM). אימות: Supabase Auth. קבצים: Supabase Storage, bucket פרטי `certification-files`.

---

## 2. Tech stack (verified)

מ-`package.json`:

| חבילה | גרסה |
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
| `better-sqlite3` | `^12.11.1` (ייבוא חד-פעמי בלבד) |
| `vitest` | `^3.2.7` |
| `eslint-config-next` | `16.2.10` |

`shadcn ^4.13.0` מופיע כ-dependency (רגיל, לא dev) — זהו ה-CLI, ואינו נדרש בזמן ריצה.

### npm scripts

| script | פעולה |
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
| `db:migrate` | `tsx scripts/migrate-postgres.ts` — מריץ **כל** קובץ `migrations/postgres/*.sql` בסדר שמות, בכל הרצה (אידמפוטנטי) |
| `db:import-sqlite` | `tsx scripts/migrate-from-sqlite.ts` — ייבוא חד-פעמי מ-SQLite |
| `db:backup` | `tsx scripts/backup-db.ts` |
| `db:restore` | `tsx scripts/restore-backup.ts` |
| `import:force-structure` | `tsx scripts/import-force-structure.ts` |

### משתני סביבה

מ-`.env.example` ומכל הפניה ל-`process.env.*` בקוד האפליקציה (`app/`, `lib/`, `scripts/`, `proxy.ts`):

| משתנה | נדרש | נקרא ב- | תפקיד |
|---|---|---|---|
| `DATABASE_URL` | כן | `lib/db/client.ts:11` | שאילתות אפליקציה (transaction pooler, port 6543). זורק שגיאה אם חסר |
| `DIRECT_URL` | למיגרציות | `scripts/migrate-postgres.ts:8`, `scripts/backup-db.ts:114` | session pooler (port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | כן | `lib/supabase/{client,server,proxy}.ts`, `lib/storage/client.ts:20` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | כן | `lib/supabase/{client,server,proxy}.ts` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | כן (לקבצים) | `lib/storage/client.ts:21` | service_role — **server-only**, לגישה ל-bucket הפרטי |
| `DB_TIMING` | לא | `lib/db/client.ts:42` | `=1` מפעיל לוג זמן/שורות לכל round-trip |
| `NODE_ENV` | אוטומטי | `lib/db/client.ts:22` | (ראה סעיף 11 — הענף חסר משמעות) |

הערה: `.env.example` **מכיל URL אמיתי של פרויקט** (`https://lwhxfjdwbwfxdnpilgeo.supabase.co`)
ולא placeholder. הקובץ מוקצה ל-git לפי ההערה בתוכו.

### קונפיגורציה

- `next.config.ts` — **ריק** (`const nextConfig: NextConfig = {}`). אין הגדרות תמונות,
  headers, redirects או `outputFileTracingIncludes`.
- `tsconfig.json` — `strict: true`, `target: ES2017`, alias `@/* -> ./*`.
- **אין `tailwind.config.*`** — Tailwind v4 מוגדר דרך `postcss.config.mjs` ו-`app/globals.css`.
- **אין `middleware.ts`** — ב-Next 16 הקובץ נקרא `proxy.ts` (בשורש), ומייצא `proxy()` + `config.matcher`.
- `vercel.json` — `{"regions": ["dub1"]}` בלבד.

---

## 3. Database schema — effective current state

### 3.1 מיגרציות בסדר הרצה

התיקייה `migrations/` מכילה **שתי סדרות**:

1. `migrations/0001_init.sql`, `0002_add_battalions_and_taxes.sql`, `0003_reserve_and_hq.sql` —
   סדרת SQLite **מיושנת**. `scripts/migrate-postgres.ts:15` קורא רק מ-`migrations/postgres/`,
   ולכן שלושת הקבצים הללו **אינם מורצים כלל**. הם שרידי המערכת המקורית.
2. `migrations/postgres/*.sql` — 24 קבצים, הסכימה בפועל.

| # | קובץ | מה משתנה |
|---|---|---|
| 001 | `001_init.sql` | סכימת בסיס: 13 טבלאות + 6 אינדקסים (ראה 3.2) |
| 002 | `002_trainings.sql` | `trainings`, `training_sessions` + 3 אינדקסים |
| 003 | `003_record_colors.sql` | `certifications.color_hex`, `trainings.color_hex` |
| 004 | `004_users.sql` | `users` (PK = UUID של Supabase Auth) + `idx_users_status` |
| 005 | `005_influencing_factors.sql` | `influencing_factors`, `influencing_factor_battalions` |
| 006 | `006_sqlite_import_gap.sql` | `training_unit_hours`; `training_sessions.sub_framework`/`content`; מסיר NOT NULL מ-`start_time`/`end_time`; `course_colors.created_at` |
| 007 | `007_training_session_notes.sql` | `training_sessions.notes` |
| 008 | `008_request_soldiers_and_registration_lock.sql` | `battalion_request_soldiers`; `certification_battalion_quotas.registration_lock_at` (מיושן מ-021) |
| 009 | `009_certification_files.sql` | `certification_files` (מטא-דאטה בלבד; ה-bytes ב-Storage) |
| 010 | `010_pivot_report_widgets.sql` | `pivot_report_widgets` (config JSONB) |
| 011 | `011_roster_request_link.sql` | `roster_entries.battalion_request_id`; מסיר NOT NULL מ-`certification_id`; CHECK `roster_entries_parent_present` |
| 012 | `012_battalion_scoped_roles.sql` | `users.battalion_id`/`requested_role_text`/`requested_battalion_text`; CHECK `users_role_allowed` + `users_battalion_scope_valid` |
| 013 | `013_force_structure.sql` | מודול "שניים לפנים": `companies`, `roles`, `role_reference`, `role_assignments`, `bank_soldiers`, `soldier_certifications`, `drone_models`, `certification_aliases` |
| 014 | `014_org_unit_types.sql` | `org_unit_types`, `org_unit_type_patterns`, `org_unit_type_members`, `org_unit_manual_counts`; VIEWS `v_org_unit_counts_base`, `v_org_unit_counts` |
| 015 | `015_gap_requirement_keys.sql` | `certification_families`, `gap_requirement_keys`, `gap_nominations`; `certification_gap_rows.family_id`/`canonical_cert_name`/`active_source`; `certification_gap_values.active_source`; VIEWS `v_role_status`, `v_certification_gaps` |
| 016 | `016_roster_tracking.sql` | `roster_admin_confirmations`, `certification_required_documents`, `roster_required_documents`; `certification_prerequisites.template_id` + מסיר NOT NULL מ-`certification_id` |
| 017 | `017_system_settings.sql` | `system_settings` (key/value) |
| 018 | `018_gap_snapshots.sql` | `certification_gap_snapshots` — **נוצרה במכוון ללא חיווט**: ההערה בקובץ אומרת "no job, no trigger, nothing writes this table" |
| 019 | `019_posting_and_pending_identity.sql` | `role_assignments.is_posted`/`pending_pn`/`pending_name` + מסיר NOT NULL מ-`full_name`/`personal_number`; `bank_soldiers.pending_pn`; מגדיר מחדש `v_role_status` |
| 020 | `020_force_structure_edit_snapshots.sql` | `force_structure_edit_snapshots` (payload JSONB) |
| 021 | `021_certification_registration_lock_date.sql` | `certifications.registration_lock_date` TEXT + CHECK פורמט; backfill חד-פעמי מ-`MIN(registration_lock_at)` |
| 022 | `022_certification_registration_lock_hour.sql` | `certifications.registration_lock_hour` SMALLINT + CHECK טווח 0–23 + CHECK "hour needs date" |
| 023 | `023_roster_status_allowed_values.sql` | CHECK `roster_entries_status_allowed` — תשעת הערכים; **ללא backfill**, זורק EXCEPTION אם קיימת שורה חריגה |
| 024 | `024_roster_requires_lodging.sql` | `roster_entries.requires_lodging` SMALLINT + CHECK `IN (0,1)` |

### 3.2 סכימה אפקטיבית (אחרי כל המיגרציות)

עמודות שנוספו במיגרציה מאוחרת מסומנות **[NNN]**.

#### `battalions`
| עמודה | טיפוס | Null | ברירת מחדל | אילוצים |
|---|---|---|---|---|
| `id` | SERIAL | לא | | PK |
| `code` | TEXT | לא | | UNIQUE |
| `name` | TEXT | לא | | |
| `color_hex` | TEXT | לא | `'#64748B'` | |
| `is_active` | SMALLINT | לא | `1` | |

#### `certifications`
| עמודה | טיפוס | Null | ברירת מחדל | אילוצים |
|---|---|---|---|---|
| `id` | SERIAL | לא | | PK |
| `template_id` | INTEGER | כן | | FK `certification_templates(id)` ON DELETE SET NULL |
| `name` | TEXT | לא | | |
| `domain` | TEXT | כן | | |
| `start_date` | TEXT | לא | | `'yyyy-MM-dd'` |
| `end_date` | TEXT | כן | | NULL/`''` = יום בודד |
| `location` | TEXT | כן | | |
| `total_slots` | INTEGER | כן | | **NULL = ללא מגבלה (unlimited)** |
| `registration_open` | SMALLINT | לא | `0` | |
| `status` | TEXT | לא | `'draft'` | enum-like, ראה 3.3 |
| `notes` | TEXT | כן | | |
| `origin_request_id` | INTEGER | כן | | ללא FK |
| `gap_row_id` | INTEGER | כן | | FK `certification_gap_rows(id)` SET NULL |
| `created_by_role` | TEXT | לא | `'brigade'` | |
| `created_at` / `updated_at` | TIMESTAMPTZ | לא | `NOW()` | עדכון ידני, אין triggers |
| `color_hex` **[003]** | TEXT | כן | | NULL = צבע מחושב |
| `registration_lock_date` **[021]** | TEXT | כן | | CHECK `~ '^\d{4}-\d{2}-\d{2}$'`; **NULL = ללא נעילה** |
| `registration_lock_hour` **[022]** | SMALLINT | כן | | CHECK 0–23; CHECK דורש `registration_lock_date IS NOT NULL`; **NULL = סוף יום הנעילה** |

אינדקסים: `idx_certifications_status(status)`, `idx_certifications_start_date(start_date)`.

#### `roster_entries`
| עמודה | טיפוס | Null | ברירת מחדל | אילוצים |
|---|---|---|---|---|
| `id` | SERIAL | לא | | PK |
| `certification_id` | INTEGER | **כן [011]** | | FK `certifications(id)` CASCADE |
| `battalion_id` | INTEGER | לא | | FK `battalions(id)` |
| `full_name` | TEXT | לא | | |
| `personal_number` | TEXT | **לא** | | ראה הערה למטה |
| `company_platoon` | TEXT | כן | | |
| `phone` | TEXT | כן | | |
| `commander_name` / `commander_phone` | TEXT | כן | | |
| `has_prior_certification` | SMALLINT | לא | `0` | |
| `prior_certification_details` | TEXT | כן | | |
| `meets_prerequisite` | SMALLINT | כן | | **NULL = לא סומן** |
| `notes` | TEXT | כן | | |
| `status` | TEXT | לא | `'registered'` | CHECK `roster_entries_status_allowed` **[023]** |
| `outcome_reason` | TEXT | כן | | |
| `is_reserve` | SMALLINT | לא | `0` | `1` = עתודה |
| `created_at` / `updated_at` | TIMESTAMPTZ | לא | `NOW()` | |
| `battalion_request_id` **[011]** | INTEGER | כן | | FK `battalion_requests(id)` |
| `requires_lodging` **[024]** | SMALLINT | לא | `0` | CHECK `IN (0,1)` — "נדרש לינה" |

CHECK `roster_entries_parent_present` **[011]**: `certification_id IS NOT NULL OR battalion_request_id IS NOT NULL`.
אינדקסים: `idx_roster_certification`, `idx_roster_battalion`, `idx_roster_battalion_request` **[011]**.

**הערה על `personal_number`:** העמודה `TEXT NOT NULL` — אינה יכולה להיות NULL. מצב
"ממתין למספר אישי" מיוצג ב-`role_assignments.pending_pn` / `bank_soldiers.pending_pn`
(מודול שניים לפנים), **לא** ב-`roster_entries`. `lib/roster/copy-format.ts` מטפל במחרוזת
ריקה כחסרה.

#### `certification_battalion_quotas`
| עמודה | טיפוס | Null | ברירת מחדל | אילוצים |
|---|---|---|---|---|
| `id` | SERIAL | לא | | PK |
| `certification_id` | INTEGER | לא | | FK CASCADE |
| `battalion_id` | INTEGER | לא | | FK CASCADE |
| `allocated_slots` | INTEGER | לא | `0` | |
| `notes` | TEXT | כן | | |
| `registration_lock_at` **[008]** | TIMESTAMPTZ | כן | | **מיושן** — 021 העביר את הדדליין ל-`certifications`; נשמר כדי לא לאבד היסטוריה, שום קוד אינו קורא אותו לאכיפה |

UNIQUE `(certification_id, battalion_id)` — זה מה שמונע כפילות ב-JOIN של `listBattalionAllocations`.

#### `users`
| עמודה | טיפוס | Null | ברירת מחדל | אילוצים |
|---|---|---|---|---|
| `id` | UUID | לא | | PK = `auth.users.id` |
| `email` | TEXT | לא | | |
| `full_name` | TEXT | כן | | |
| `role` | TEXT | לא | `'viewer'` | CHECK `users_role_allowed` **[012]** |
| `status` | TEXT | לא | `'pending'` | |
| `approved_by` | UUID | כן | | FK `users(id)` |
| `approved_at` | TIMESTAMPTZ | כן | | |
| `created_at` | TIMESTAMPTZ | לא | `NOW()` | |
| `battalion_id` **[012]** | INTEGER | כן | | FK `battalions(id)`; CHECK `users_battalion_scope_valid` |
| `requested_role_text` **[012]** | TEXT | כן | | טקסט חופשי מההרשמה |
| `requested_battalion_text` **[012]** | TEXT | כן | | |

`users_battalion_scope_valid`: תפקיד גדודי ⇔ `battalion_id IS NOT NULL`. אינדקסים: `idx_users_status`, `idx_users_battalion`.

#### שאר הטבלאות (תמצית)

| טבלה | עמודות מרכזיות | הערות |
|---|---|---|
| `certification_gap_rows` | `id`, `certification_name`, `sort_order`, `family_id` **[015]**, `canonical_cert_name` **[015]**, `active_source` **[015]** NOT NULL DEFAULT `'establishment'` | CHECK `active_source IN ('operational','establishment')` |
| `certification_gap_values` | PK `(row_id, battalion_id)`, `gap_count`, `sent_count`, `active_source` **[015]** nullable | `active_source` NULL = ירושה מ-`certification_gap_rows` |
| `certification_templates` | 16 עמודות: `name`, `domain`, `default_location`, `default_slots`, `default_notes`, `gap_row_id`, `checkin_details`, `duration_text`, `trainee_ratio`, `ammo_required`, `requirements_text`, `equipment_text`, `contacts_text`, `color_hex` **[003]** | `default_slots` NULL = ללא מגבלה |
| `certification_prerequisites` | `certification_id` (nullable **[016]**), `template_id` **[016]**, `description` | CHECK `cert_prereq_parent_present` |
| `certification_taxes` | `certification_id`, `role_name`, `is_fulfilled` SMALLINT, `notes` | "מיסים" |
| `battalion_requests` | `battalion_id`, `requested_cert_type`, `quantity_needed`, `reason`, `urgency`, `desired_date`, `notes`, `status`, `linked_certification_id` | |
| `battalion_request_soldiers` **[008]** | `request_id`, `full_name`, `personal_number` (nullable), `phone`, `battalion_id` | ראה 3.4 — כפילות מודל |
| `notifications` | `type`, `target_role`, `entity_type`, `entity_id`, `message`, `is_read` | `idx_notifications_target` |
| `status_history` | `entity_type`, `entity_id`, `old_status`, `new_status`, `changed_by_role`, `note`, `changed_at` | append-only |
| `course_colors` | PK `name`, `color_hex`, `created_at` **[006]** | |
| `trainings` | `name`, `domain`, `start_date`, `end_date`, `contact_name`, `contact_phone`, `notes`, `color_hex` **[003]** | |
| `training_sessions` | `training_id`, `battalion_id`, `session_date`, `start_time` (nullable **[006]**), `end_time` (nullable **[006]**), `location`, `instructor_name`, `instructor_phone`, `sub_framework` **[006]**, `content` **[006]**, `notes` **[007]** | |
| `training_unit_hours` **[006]** | UNIQUE `(training_id, day_date, battalion_id)`, `hours` NUMERIC | |
| `influencing_factors` / `influencing_factor_battalions` **[005]** | `name`, `start_date`, `end_date`, `notes` / PK מורכב | "גורם משפיע" |
| `certification_files` **[009]** | `certification_id`, `storage_path` UNIQUE, `original_name`, `mime_type`, `size_bytes` BIGINT, `uploaded_by` TEXT | ה-bytes ב-Storage |
| `pivot_report_widgets` **[010]** | `id` UUID DEFAULT `gen_random_uuid()`, `name`, `config` JSONB, `created_by` | |
| `companies` **[013]** | `battalion_id`, `code`, `name`, `kind` CHECK `IN ('rifle','support')`, `sort_order`; UNIQUE `(battalion_id, code)` | |
| `roles` **[013]** | `company_id`, `department`, `squad`, `serial`, `role_name`, `req1..req3`, מיוני `dept_sort`/`squad_sort`/`row_sort`; UNIQUE `(company_id, serial)` | reference data סטטי |
| `role_reference` **[013]** | `company_kind` CHECK, `department`, `serial`, `role_name`, `req1..3`, `provenance`; UNIQUE `(company_kind, serial)` | נכתב רק ע"י ה-importer |
| `role_assignments` **[013]** | `role_id` UNIQUE, `full_name` (nullable **[019]**), `personal_number` (nullable **[019]**), `rank`, `phone`, `is_posted` **[019]**, `pending_pn` **[019]**, `pending_name` **[019]** | CHECKs: `(pending_pn=1) = (personal_number IS NULL)`, `(pending_name=1) = (full_name IS NULL)` |
| `bank_soldiers` **[013]** | `company_id`, `department`, `full_name`, `personal_number` (nullable **[019]**), `rank`, `unavailable_until`, `note`, `pending_pn` **[019]** | UNIQUE `(company_id, personal_number)` |
| `soldier_certifications` **[013]** | UNIQUE `(personal_number, certification_name)`, `raw_name`, `source` CHECK `IN ('manual','import','certifications_module')` | |
| `drone_models` **[013]** | `name` UNIQUE, `sort_order` | |
| `certification_aliases` **[013]** | PK `alias`, `canonical_name`, `kind` CHECK `IN ('typo','spelling','synonym','quarantine')` | |
| `org_unit_types` **[014]** | `code` UNIQUE, `name`, `kind` CHECK `IN ('base','composite')`, `sort_order` | |
| `org_unit_type_patterns` **[014]** | `unit_type` FK, `grain` CHECK `IN ('battalion','company','department','squad')`, `match_target` CHECK `IN ('company_kind','company_name','department','squad')`, `pattern` | נקרא **דרך VIEW** בלבד |
| `org_unit_type_members` **[014]** | PK `(parent_code, child_code)` | נקרא **דרך VIEW** בלבד |
| `org_unit_manual_counts` **[014]** | PK `(battalion_id, unit_type)`, `unit_count` CHECK `>= 0`, `note` | |
| `certification_families` **[015]** | `name` UNIQUE, `ink`, `line`, `bg`, `sort_order` | צבעי משפחה |
| `gap_requirement_keys` **[015]** | `gap_row_id`, `battalion_id`, `source` CHECK `IN ('operational','establishment')`, `qty` CHECK `>= 0`, `unit_type` FK; UNIQUE `(gap_row_id, battalion_id, source, sort_order)` | |
| `gap_nominations` **[015]** | `gap_row_id`, `battalion_id`, `certification_id`, `role_assignment_id`, `free_text_name`, `note`, `created_by_role` | CHECK `gap_nominations_exactly_one_subject`: או `role_assignment_id` או `free_text_name`, לא שניהם |
| `roster_admin_confirmations` **[016]** | `roster_entry_id` UNIQUE, `confirmed_at`, `confirmed_by_role`, `note` | שכבת מעקב נפרדת |
| `certification_required_documents` **[016]** | UNIQUE `(template_id, doc_type)` | |
| `roster_required_documents` **[016]** | UNIQUE `(roster_entry_id, doc_type)`, `is_provided`, `provided_at`, `note` | |
| `system_settings` **[017]** | PK `key`, `value`, `description`, `updated_by` | **ללא שימוש בקוד** |
| `certification_gap_snapshots` **[018]** | UNIQUE `(row_id, battalion_id, snapshot_month)`, `gap_count`, `held_count`, `required_count`, `surplus_count`; CHECK `snapshot_month ~ '^\d{4}-\d{2}$'` | **ללא שימוש בקוד** |
| `force_structure_edit_snapshots` **[020]** | `battalion_id`, `created_by_user`, `created_by_role`, `payload` JSONB | `idx_fs_edit_snapshots_batt_user` |

#### VIEWS

| view | הוגדר ב- | תוכן |
|---|---|---|
| `v_org_unit_counts_base` | 014 | ספירת יחידות מ-`roles` לפי patterns |
| `v_org_unit_counts` | 014 | הספירה הסופית, כולל `unit_count_source` (`'manual'` או מחושב) |
| `v_role_status` | 015, **הוגדר מחדש ב-019** | מצב תקן/שיבוץ לכל post |
| `v_certification_gaps` | 015 | חישוב הפער: `required` (מ-`gap_requirement_keys` × `v_org_unit_counts`), `held` (חיתוך `soldier_certifications` ∩ `role_assignments`), `surplus` |

### 3.3 עמודות status ומלוא ערכיהן

| עמודה | קבוע הקוד | ערכים | CHECK ב-DB |
|---|---|---|---|
| `certifications.status` | `CERTIFICATION_STATUSES` (`lib/types.ts:10`) | `draft`, `open`, `full`, `closed`, `in_progress`, `completed`, `cancelled` | **אין** |
| `roster_entries.status` | `ROSTER_STATUSES` (`lib/types.ts:40`) | `registered`, `pending_approval`, `approved`, `rejected`, `participated`, `did_not_participate`, `did_not_report`, `passed`, `failed` | **יש** — `roster_entries_status_allowed` **[023]** |
| `battalion_requests.status` | `REQUEST_STATUSES` (`lib/types.ts:72`) | `opened`, `in_review`, `approved`, `rejected`, `certification_opened`, `closed` | **אין** |
| `battalion_requests.urgency` | `URGENCY_LEVELS` (`lib/types.ts:89`) | `low`, `normal`, `high`, `urgent` | **אין** |
| `users.role` | `USER_ROLES` (`lib/types.ts:118`) | `super_admin`, `editor`, `viewer`, `viewer_battalion`, `editor_battalion` | **יש** — `users_role_allowed` **[012]** |
| `users.status` | `USER_STATUSES` (`lib/types.ts:138`) | `pending`, `approved`, `rejected` | **אין** |
| `notifications.type` | `NotificationType` (`lib/types.ts:402`) | `certification_opened`, `opened_from_request`, `soldier_added`, `date_approaching`, `registration_closed`, `soldier_approved`, `soldier_rejected`, `certification_cancelled`, `certification_changed`, `user_registered` | **אין** |

**אין `CREATE TYPE` / enum טבעי בשום מקום** — כל ה-enums הם TEXT + CHECK או TEXT ללא אילוץ.

### 3.4 NULL כמשמעות סמנטית

| עמודה | NULL אומר |
|---|---|
| `certifications.total_slots` | ללא מגבלת מקומות (unlimited). `computeSlotsRemaining` ב-`lib/utils/slots.ts` מחזיר NULL |
| `certifications.registration_lock_date` | לא נקבע מועד נעילה — **נקרא כ"פתוח", לעולם לא כ"חלף"** (`lib/utils/registration-lock.ts`) |
| `certifications.registration_lock_hour` | סוף יום הנעילה (שעה 24) — שומר על הסמנטיקה שלפני 022 |
| `certifications.color_hex` / `trainings.color_hex` | צבע מחושב מהשם (`lib/utils/cert-colors.ts`) |
| `certifications.end_date` (או `''`) | הסמכה של יום בודד |
| `roster_entries.meets_prerequisite` | דרישת מעבר לא סומנה (לא "לא עומד") |
| `certification_battalion_quotas` — היעדר שורה | אין הקצאה לגדוד; שונה מהקצאה של 0 |
| `certification_gap_values.active_source` | ירושה מ-`certification_gap_rows.active_source` |
| `users.battalion_id` | תפקיד גלובלי (לא גדודי) |
| `certification_templates.default_slots` | ללא מגבלה |

### 3.5 טבלאות ללא שימוש / שימוש עקיף

| טבלה | מצב |
|---|---|
| `system_settings` **[017]** | **מתה** — אפס הפניות בכל `lib/`, `app/`, `scripts/`. נוצרה עבור "חלון סגירת ההרשמה" ולא חוברה |
| `certification_gap_snapshots` **[018]** | **מתה** — ההערה במיגרציה מצהירה על כך. `getGapRowSnapshot` (`lib/db/repositories/certification-gaps.ts:130`) **אינו** קורא אותה; הוא מחשב חי מ-`certification_gap_values` + `roster_entries` |
| `org_unit_type_patterns`, `org_unit_type_members` **[014]** | אין הפניה ישירה מ-TS, אך שתיהן נקראות ע"י `v_org_unit_counts_base` / `v_org_unit_counts`, שנקראים מ-`lib/db/repositories/gaps.ts`. **בשימוש עקיף** |
| `training_unit_hours` **[006]** | מוזכר רק ב-`scripts/migrate-from-sqlite.ts` (ייבוא). אין קריאה מהאפליקציה |
| `role_reference` **[013]** | נכתב רק ב-`lib/import/write-force-structure.ts:220`. אין קריאה מהאפליקציה |
| `certification_battalion_quotas.registration_lock_at` **[008]** | עמודה מיושנת במכוון (021) |

**קוד המפנה לטבלה/עמודה שאין לה מיגרציה:** לא נמצא. כל שם טבלה שמופיע ב-SQL בתוך `lib/`
קיים במיגרציות (`pair`, `turns`, `unnest` שהופיעו בסריקה הם aliases/פונקציות SQL, לא טבלאות).

---

## 4. Repository layer

`lib/db/client.ts` — pool יחיד (`pg.Pool`, `max: 10`) על גלובל, עם `query` / `queryOne` /
`execute` / `withTransaction`. כל שורה עוברת `normalizeRow` שממיר `Date` ל-ISO string.

| קובץ | פונקציות מיוצאות | טבלאות |
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
| `export.ts` | `getExportData`, `getTrainingExportData` | דרך repositories אחרים |
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

### 4.1 N+1 — שאילתות בתוך לולאה

| מקום | תיאור | חומרה |
|---|---|---|
| `lib/db/repositories/export.ts:67` | `certs.map(async …)` עם **5 שאילתות לכל הסמכה** (`listQuotas`, `listRosterForCertification`, `listReserveForCertification`, `listTaxes`, `listPrerequisites`) → 5N | **גבוהה** — מזין את `/reports` וכל הייצוא |
| `lib/db/repositories/export.ts:177` | `trainings.map(async …)` → `listSessionsForTraining` לכל הדרכה | בינונית |
| `app/calendar/page.tsx:35` | `getCertificationBattalions` לכל הסמכה | **גבוהה** — עמוד הבית בפועל |
| `app/calendar/page.tsx:41` | `getTrainingBattalions` לכל הדרכה | גבוהה |
| `app/calendar/page.tsx:45` | `getInfluencingFactorBattalions` לכל גורם | בינונית |
| `app/reports/page.tsx:45,51` | אותה תבנית כמו הלוח | גבוהה |
| `app/battalions/[code]/page.tsx:130` | `getInfluencingFactorBattalions` לכל גורם | בינונית |
| `app/reports/pivot/page.tsx:36` | `runPivotReport` לכל widget שמור | **גבוהה** — דוח שלם per widget |
| `lib/db/repositories/influencing-factors.ts:99` | INSERT לכל `battalion_id` (בתוך transaction) | נמוכה (כתיבה, N קטן) |
| `lib/db/repositories/certifications.ts:356, 421, 444` | INSERT בלולאה ב-`replacePrerequisites` / `replaceQuotas` / `replaceTaxes` (בתוך transaction) | נמוכה |
| `lib/db/repositories/certifications.ts:308` | UPDATE + `recordStatusChange` לכל roster entry ב-`confirmCertificationCompletion` | נמוכה-בינונית |
| `lib/db/repositories/trainings.ts:114, 178` | INSERT לכל session | נמוכה |
| `lib/db/repositories/requests.ts:163` | INSERT ל-`roster_entries` לכל חייל בדרישה | נמוכה |
| `lib/db/repositories/roster.ts:568` | UPDATE + `recordStatusChange` לכל entry ב-`approveTraineeList` | נמוכה |

לולאות שאינן N+1 (עיבוד בזיכרון בלבד, נבדקו): `app/templates/page.tsx:12`,
`app/trainings/[id]/page.tsx:39`, `lib/db/repositories/battalion-dashboard.ts:138`,
וכל הלולאות ב-`components/`.

`lib/db/repositories/battalion-dashboard.ts:listBattalionAllocations` תוקן במכוון להימנע
מ-N+1: ספירות ה-roster מגיעות מ-subquery מקובץ אחד, והחיילים נשלפים בשאילתה אחת עם
`certification_id = ANY($2::int[])`.

---

## 5. API surface — full route inventory

**67 קבצי route, 96 method handlers.**

סיווג `authorization source` לפי הקוד בפועל (הערות סוננו — כמה routes מזכירים בהערה את
ה-gate הקודם שלהם):

- `session` — מזהה את המשתמש/התפקיד מה-session המאומת בצד השרת
- `active_role cookie` — קורא את התפקיד מה-cookie **(ניתן לזיוף)**
- `permission predicate` — קורא `canManage*` / `can*`
- `none` — ללא שמירה

כאשר route משלב `session` + `permission predicate` על `AppUser`, הסיווג הוא `session`
(ה-predicate מקבל את הזהות המאומתת). כאשר ה-predicate מקבל `Role` מה-cookie ואין בדיקת
session — הסיווג הוא `active_role cookie`.

| method | path | purpose | validation | authorization source |
|---|---|---|---|---|
| GET | `/api/me` | זהות המשתמש הנוכחי | none | `session` (`getCurrentUser`) |
| POST | `/api/role` | קובע את cookie ה-`active_role` | none | **`none`** |
| GET | `/api/audit` | היסטוריית סטטוסים לישות | none | **`none`** |
| GET | `/api/admin/users` | כל המשתמשים | none | `session` (`requireSuperAdmin`) |
| PATCH, DELETE | `/api/admin/users/[id]` | אישור/תפקיד/דחייה | `userPatchSchema` | `session` (`requireSuperAdmin`) |
| GET | `/api/battalions` | רשימת גדודים (מסונן ל-scope) | none | `session` (`getBattalionScope`) |
| GET | `/api/battalions/[id]/summary` | סיכום גדוד | none | `session` (`requireApprovedUser` + `denyOutOfScope`) |
| GET | `/api/battalions/[id]/weekly-export` | PDF שבועי | `battalionIdParamSchema`, `weeklyExportQuerySchema` | `session` (`requireApprovedUser` + `denyOutOfScope`) |
| GET, POST | `/api/battalions/[id]/certifications/[certId]/roster` | roster של גדוד | `battalionRosterEntrySchema` | `session` (`requireApprovedUser`+`denyOutOfScope` / `requireBattalionEditor`) |
| PATCH, DELETE | `/api/battalions/[id]/certifications/[certId]/roster/[entryId]` | עדכון/מחיקת חייל | `battalionRosterEntrySchema` | `session` (`requireBattalionEditor`) |
| GET | `/api/certifications` | רשימת הסמכות | none | **`none`** |
| POST | `/api/certifications` | יצירת הסמכה | `certificationCreateSchema` | **`active_role cookie`** |
| GET | `/api/certifications/[id]` | הסמכה + prereq/quotas/taxes | none | **`none`** |
| PATCH | `/api/certifications/[id]` | עדכון חלקי | `certificationPatchSchema` | `session` (`requireCertificationManager` = `requireEditor` + cookie כ-scope) |
| DELETE | `/api/certifications/[id]` | מחיקה + ניקוי Storage | none | `session` (`requireCertificationManager`) |
| PATCH | `/api/certifications/[id]/status` | שינוי סטטוס | `certificationStatusSchema` | `session` (`requireApprovedUser` + `canManageCertificationStatus`) |
| POST | `/api/certifications/[id]/confirm-completion` | אישור סיום + עדכון פערים | none | **`active_role cookie`** |
| GET, POST | `/api/certifications/[id]/files` | קבצים מצורפים + העלאה | `certificationFileUploadSchema` | `session` (`requireEditor`) |
| DELETE | `/api/certifications/[id]/files/[fileId]` | מחיקת קובץ | none | `session` (`requireEditor`) |
| POST | `/api/certifications/[id]/quotas/[battalionId]/approve-trainees` | אישור רשימת מתאמנים | `traineeApprovalSchema` | `session` (`requireEditor`) + cookie ל-scope גדודי |
| GET | `/api/certifications/[id]/roster` | roster של הסמכה | none | `session` (`requireApprovedUser`) |
| POST | `/api/certifications/[id]/roster` | הוספת חייל | `rosterEntrySchema` | `session` (`requireApprovedUser` + `canManageRosterEntry`) |
| GET, PATCH, DELETE | `/api/roster/[entryId]` | חייל בודד | `rosterEntrySchema` | `session` (`requireApprovedUser` + `canManageRosterEntry`) |
| PATCH | `/api/roster/[entryId]/status` | סטטוס חייל | `rosterStatusSchema` | `session` (`requireApprovedUser` + `canManageRosterEntry`) |
| PUT, DELETE | `/api/roster/[entryId]/admin-confirmation` | אישור שלישותי | none | `session` (`requireBattalionEditor`) |
| PATCH | `/api/taxes/[taxId]/fulfilled` | סימון מיס | none | **`active_role cookie`** |
| GET | `/api/templates` | בנק תבניות | none | **`none`** |
| POST | `/api/templates` | תבנית חדשה | `templateSchema` | **`active_role cookie`** |
| GET | `/api/templates/[id]` | תבנית בודדת | none | **`none`** |
| PATCH, DELETE | `/api/templates/[id]` | עדכון/מחיקה | `templateSchema` | **`active_role cookie`** |
| PATCH | `/api/templates/course/[name]` | שינוי שם קורס | none | **`active_role cookie`** |
| GET | `/api/trainings` | רשימת הדרכות | none | **`none`** |
| POST | `/api/trainings` | הדרכה חדשה | `trainingSchema` | **`active_role cookie`** |
| GET | `/api/trainings/[id]` | הדרכה בודדת | none | **`none`** |
| PATCH, DELETE | `/api/trainings/[id]` | עדכון/מחיקה | `trainingSchema` | **`active_role cookie`** |
| POST | `/api/trainings/[id]/sessions` | בלוק חדש | `trainingSessionSchema` | **`active_role cookie`** |
| PATCH, DELETE | `/api/trainings/[id]/sessions/[sessionId]` | עדכון/מחיקת בלוק | `trainingSessionSchema` | **`active_role cookie`** |
| GET | `/api/requests` | דרישות גדודים | none | `session` (`requireApprovedUser` + `getBattalionScope`) |
| POST | `/api/requests` | דרישה חדשה | `requestSchema` | `session` (`requireApprovedUser` + `canEditBattalion`) |
| GET, PATCH, DELETE | `/api/requests/[id]` | דרישה בודדת | `requestSchema` | `session` (`requireEditor` + `denyOutOfScope`) |
| PATCH | `/api/requests/[id]/status` | סטטוס דרישה | `requestStatusSchema` | **`active_role cookie`** |
| GET, POST | `/api/requests/[id]/soldiers` | חיילים בדרישה | `requestSoldierSchema` | `session` (`requireApprovedUser`+`denyOutOfScope` / `requireEditor`) |
| DELETE | `/api/requests/[id]/soldiers/[soldierId]` | הסרת חייל | none | `session` (`requireEditor`) |
| POST | `/api/requests/[id]/link-certification` | קישור להסמכה | none | **`active_role cookie`** |
| POST | `/api/requests/[id]/open-certification` | פתיחת הסמכה מדרישה | `certificationSchema` | **`active_role cookie`** |
| GET | `/api/certification-gaps` | מטריצת פערים | none | `session` (`requireApprovedUser` + `getBattalionScope`) |
| POST | `/api/certification-gaps` | שורת פער חדשה | none (בדיקה ידנית) | **`active_role cookie`** |
| DELETE | `/api/certification-gaps/[rowId]` | מחיקת שורה | none | **`active_role cookie`** |
| PUT | `/api/certification-gaps/[rowId]/value` | עדכון פער | none | **`active_role cookie`** |
| PUT | `/api/certification-gaps/[rowId]/sent` | עדכון "נשלחו" | none | **`active_role cookie`** |
| GET | `/api/certification-gaps/[rowId]/snapshot` | תצלום שורת פער | none | **`none`** |
| GET | `/api/gaps` | פערים מחושבים | none | `session` (`requireApprovedUser` + `denyOutOfScope`) |
| PUT | `/api/gaps/[rowId]/key` | מפתח חישוב מבצעי | none | `session` (`requireBattalionEditor`) |
| PUT | `/api/gaps/[rowId]/active-source` | מקור פעיל | none | `session` (`requireBattalionEditor`) |
| POST, DELETE | `/api/gaps/[rowId]/nominations` | מועמדים | `createSchema` (מקומי) | `session` (`requireBattalionEditor`) |
| GET | `/api/force-structure/soldiers` | חיפוש חיילים | none | `session` (`requireApprovedUser` + `denyOutOfScope`) |
| POST | `/api/force-structure/assignments/[id]/move` | הזזת שיבוץ | `assignmentMoveSchema` | `session` (`requireBattalionEditor`) |
| POST | `/api/force-structure/bank/[id]/move` | הצבה מהבנק | none | `session` (`requireBattalionEditor`) |
| POST | `/api/force-structure/edit-session` | פתיחת session עריכה | none | `session` (`requireBattalionEditor`) |
| DELETE | `/api/force-structure/edit-session/[id]` | סגירה | none | `session` (`requireBattalionEditor`) |
| POST | `/api/force-structure/edit-session/[id]/revert` | ביטול עריכות | none | `session` (`requireBattalionEditor`) |
| GET | `/api/notifications` | התראות לפי תפקיד | none | `session` (`getCurrentUser`+`getBattalionScope`) + cookie לסינון תצוגה |
| PATCH | `/api/notifications/read-all` | סימון הכל כנקרא | none | `session` (`getCurrentUser`+`getBattalionScope`) + cookie |
| PATCH | `/api/notifications/[id]/read` | סימון התראה כנקראה | none | **`none`** |
| GET | `/api/reports/by-month` | הסמכות לפי חודש | none | `session` (`requireApprovedUser`+`getBattalionScope`) |
| GET | `/api/reports/open-for-registration` | פתוחות להרשמה | none | `session` |
| GET | `/api/reports/completed` | הסמכות שבוצעו | none | `session` |
| GET | `/api/reports/open-requests-by-battalion` | דרישות פתוחות | none | `session` |
| GET | `/api/reports/gaps-by-battalion` | פערים לפי גדוד | none | `session` |
| GET | `/api/reports/roster-counts` | ספירות roster | none | `session` |
| GET | `/api/reports/battalion-roster` | חיילים לפי הסמכה וגדוד | none | `session` |
| GET | `/api/reports/pivot/options` | אפשרויות סינון | none | `session` (`requireApprovedUser`) |
| POST | `/api/reports/pivot` | הרצת פילוח | `pivotQuerySchema` | `session` (`requireApprovedUser`+`getBattalionScope`) |
| GET, POST | `/api/reports/pivot/widgets` | widgets שמורים | `pivotWidgetSaveSchema` | `session` (`requireApprovedUser`) |
| PATCH, DELETE | `/api/reports/pivot/widgets/[id]` | עדכון/מחיקת widget | `pivotWidgetSaveSchema`, `pivotWidgetIdSchema` | `session` (`requireApprovedUser`) |
| GET, POST | `/api/influencing-factors` | גורמים משפיעים | `influencingFactorSchema` | `session` (`requireEditor`) |
| GET, PATCH, DELETE | `/api/influencing-factors/[id]` | גורם בודד | `influencingFactorSchema` | `session` (`requireEditor`) |

### 5.1 ★ Routes שאינם מאושרים מה-session — הפלט המרכזי של ה-audit

**סה"כ 29 method handlers מתוך 96 אינם מאשרים מה-session המאומת.**

#### א. ללא כל שמירה בהאנדלר (`none`) — 9 handlers

| method | path | מה חשוף | הערה |
|---|---|---|---|
| POST | `/api/role` | קביעת cookie ה-`active_role` לכל ערך | `app/api/role/route.ts` — **זהו השורש**: הוא מה שהופך אישור-על-בסיס-cookie לניתן לזיוף |
| GET | `/api/audit` | `status_history` של כל ישות | `app/api/audit/route.ts` — אין סינון גדוד |
| GET | `/api/certification-gaps/[rowId]/snapshot` | פערים + `sent_total` **לכל הגדודים** | `app/api/certification-gaps/[rowId]/snapshot/route.ts:6` — חוצה גדודים |
| PATCH | `/api/notifications/[id]/read` | סימון **כל** התראה כנקראה לפי id | `app/api/notifications/[id]/read/route.ts` — `/api/notifications` נמצא ב-`API_ALLOW_ANY`, ולכן גם בדיקת ה-WRITE_METHODS של ה-proxy מדלגת עליו |
| GET | `/api/certifications` | כל ההסמכות | `app/api/certifications/route.ts:14` |
| GET | `/api/certifications/[id]` | הסמכה + quotas + roster + taxes | `app/api/certifications/[id]/route.ts:45` |
| GET | `/api/templates` | בנק התבניות | `app/api/templates/route.ts:7` |
| GET | `/api/templates/[id]` | תבנית בודדת | `app/api/templates/[id]/route.ts:7` |
| GET | `/api/trainings` + `/api/trainings/[id]` | הדרכות | `app/api/trainings/route.ts:7`, `app/api/trainings/[id]/route.ts:13` |

#### ב. אישור מה-`active_role` cookie בלבד — 20 handlers

כולם בתבנית `const role = await getCurrentRole(); if (!canManage*(role)) return 403;`
ללא שום בדיקת session. `getCurrentRole()` (`lib/auth/current-role.ts`) **מחזיר `"brigade"`
כברירת מחדל כאשר ה-cookie חסר או לא תקין** — כלומר בהיעדר cookie הבקשה נחשבת חטיבתית.

| method | path | פעולה |
|---|---|---|
| POST | `/api/certifications` | יצירת הסמכה |
| POST | `/api/certifications/[id]/confirm-completion` | אישור סיום + **הפחתת פערים** |
| PATCH | `/api/taxes/[taxId]/fulfilled` | סימון מיס |
| POST | `/api/certification-gaps` | שורת פער חדשה |
| DELETE | `/api/certification-gaps/[rowId]` | מחיקת שורת פער |
| PUT | `/api/certification-gaps/[rowId]/value` | עדכון פער |
| PUT | `/api/certification-gaps/[rowId]/sent` | עדכון "נשלחו" |
| PATCH | `/api/requests/[id]/status` | סטטוס דרישה |
| POST | `/api/requests/[id]/link-certification` | קישור דרישה |
| POST | `/api/requests/[id]/open-certification` | פתיחת הסמכה מדרישה |
| POST | `/api/templates` | תבנית חדשה |
| PATCH, DELETE | `/api/templates/[id]` | עדכון/מחיקת תבנית (2) |
| PATCH | `/api/templates/course/[name]` | שינוי שם קורס |
| POST | `/api/trainings` | הדרכה חדשה |
| PATCH, DELETE | `/api/trainings/[id]` | עדכון/מחיקת הדרכה (2) |
| POST | `/api/trainings/[id]/sessions` | בלוק חדש |
| PATCH, DELETE | `/api/trainings/[id]/sessions/[sessionId]` | עדכון/מחיקת בלוק (2) |

#### ג. תלות חלקית ב-cookie (session קיים — לא פער אישור, אך שווה תיעוד)

| path | השימוש ב-cookie |
|---|---|
| `/api/certifications/[id]` PATCH/DELETE | `requireCertificationManager()` מריץ `requireEditor()` **תחילה** ואז `canManageCertifications(getCurrentRole())` כ-scope. ה-cookie יכול רק **לצמצם**, לא להרחיב |
| `/api/certifications/[id]/quotas/[battalionId]/approve-trainees` | `requireEditor()` + `isBrigade(role)` מה-cookie כדי להחליט אם לאמת התאמת גדוד |
| `/api/notifications`, `/api/notifications/read-all` | ה-cookie בוחר את `target_role` לסינון/סימון — תצוגה, לא הרשאה |
| `/api/requests/*`, `/api/certification-gaps` GET | ה-cookie משמש ל-`changedByRole` באודיט או לסינון תצוגה |

#### ד. שכבת ההגנה בפועל — ומדוע היא לא מספקת

`proxy.ts` **כן** אוכף session ותפקיד לכל `/api`:
- לא מאומת → redirect ל-`/login` (שורות 47–54)
- לא `approved` ולא ב-`API_ALLOW_ANY` → 403
- `/api/admin` → `super_admin` בלבד
- תפקיד גדודי + נתיב שאינו ב-`BATTALION_SCOPED_API_PREFIXES` → 403
- `WRITE_METHODS` (POST/PUT/PATCH/DELETE) → דורש `canEditData` (global `editor`/`super_admin`), למעט `editor_battalion` בנתיבים מוגדרים

**אבל** — שלוש הסתייגויות מהותיות:

1. **כל בלוק הגזירה עטוף ב-`try { … } catch { }`** (`proxy.ts:60`–`131`), עם ההערה
   "Best-effort gate; fall through and let page/handler guards enforce". אם `getUserById`
   נכשל (תקלת DB, timeout של pooler) הבקשה **ממשיכה ללא כל אכיפת תפקיד** — ואצל 29
   ה-handlers שלמעלה אין "handler guard" שיאכוף.
2. `API_ALLOW_ANY` כולל את `/api/notifications`, ולכן `PATCH /api/notifications/[id]/read`
   פטור גם מבדיקת ה-WRITE_METHODS — כל משתמש מאושר, כולל `viewer` וכולל תפקיד גדודי,
   יכול לסמן כל התראה של כל אחד.
3. ה-GET-ים חסרי השמירה (קטגוריה א) עוברים את ה-proxy עבור כל משתמש **גלובלי** מאושר,
   כולל `viewer` — כלומר אין הפרדת קריאה ברמת ההאנדלר בכלל.

**המסקנה המעשית:** ההגנה תקפה כל עוד ה-proxy מצליח. היא ריכוזית, לא הגנה בשכבות, ואינה
עומדת בהצהרה שבתוך הקוד עצמו (`lib/auth/permissions.ts`) שלפיה ציר ה-cookie אינו ציר אישור.

---

## 6. Authorization model

### 6.1 predicates ב-`lib/auth/permissions.ts`

#### מקבלים `AppUser` (סמכותי — מה-session)

| חתימה | כלל |
|---|---|
| `canView(user)` | `status === 'approved'` |
| `canEdit(user)` | `approved` **וגם** תפקיד `super_admin` או `editor`. **מחזיר false ל-`editor_battalion`** — במכוון |
| `canManageUsers(user)` | `approved` וגם `super_admin` |
| `isSuperAdmin(user)` | זהה ל-`canManageUsers` |
| `isBattalionScoped(user)` | התפקיד ב-`BATTALION_SCOPED_ROLES` (ללא תלות ב-status) |
| `getScopedBattalionId(user)` | `battalion_id` לתפקיד גדודי מאושר, אחרת `null` = ללא סינון |
| `canEditBattalion(user, battalionId)` | `canEdit` → כל גדוד; `editor_battalion` → רק `battalion_id` שלו; אחרת false |
| `canEditAnything(user)` | `canEdit` או `editor_battalion` מאושר. **לא בדיקת אישור** — רק להצגת affordance |
| `canManageCertificationStatus(user)` | delegates ל-`canEdit` |
| `canManageRosterEntry(user, battalionId)` | delegates ל-`canEditBattalion` — יכולת ובעלות בקריאה אחת |
| `canManageAnyRoster(user)` | delegates ל-`canEditAnything`. **לא בדיקת אישור** |
| `auditRoleOf(user, battalionCode?)` | מחרוזת ל-`status_history.changed_by_role`: `battalion:CODE` לתפקיד גדודי, אחרת `"brigade"` |

#### מקבלים `Role` (ציר ה-cookie — תצוגה)

| חתימה | כלל |
|---|---|
| `isBrigade(role)` | `role === 'brigade'` |
| `battalionCodeOf(role)` | החלק שאחרי `battalion:` או null |
| `canManageCertifications(role)` | `isBrigade(role)` |
| `canApproveRoster(role)` | `isBrigade(role)` |
| `canManageTrainings(role)` | `isBrigade(role)` |
| `canApproveRequests(role)` | `isBrigade(role)` |
| `canSubmitRequest(role, battalionId, codeById)` | חטיבה → true; אחרת התאמת קוד גדוד |
| `canRegisterSoldier(role)` | **`return true` תמיד** — אינו בודק דבר |
| `canViewBattalionData(role, code)` | חטיבה → true; אחרת התאמת קוד |

### 6.2 מטריצת תפקיד × יכולת

לפי ה-predicates והאכיפה ב-`proxy.ts` וב-handlers:

| יכולת | `super_admin` | `editor` | `viewer` | `editor_battalion` | `viewer_battalion` |
|---|---|---|---|---|---|
| צפייה בכל המערכת | כן | כן | כן | לא — 4+2 מקטעים | לא — 4+2 מקטעים |
| יצירה/עריכת הסמכה | כן | כן | לא | לא | לא |
| שינוי סטטוס הסמכה | כן | כן | לא | לא | לא |
| קבצים מצורפים | כן | כן | לא | לא | לא |
| מועד נעילת הרשמה | כן | כן | לא | לא | לא |
| הדרכות / תבניות | כן | כן | לא | לא | לא |
| roster — כל גדוד | כן | כן | לא | לא | לא |
| roster — הגדוד שלו | כן | כן | לא | **כן** | לא |
| דרישה חדשה לגדוד שלו | כן | כן | לא | **כן** | לא |
| סטטוס דרישה | כן | כן | לא | לא | לא |
| שניים לפנים (כתיבה) | כן | כן | לא | **כן** (גדודו) | לא |
| פערים — מפתח/מועמדים | כן | כן | לא | **כן** (גדודו) | לא |
| אישור שלישותי | כן | כן | לא | **כן** (גדודו) | לא |
| דוחות (קריאה) | כן | כן | כן | גדודו בלבד | גדודו בלבד |
| ייצוא PDF שבועי | כן | כן | כן | גדודו בלבד | גדודו בלבד |
| widgets של פילוח (שמירה/מחיקה) | כן | כן | **כן** | כן | כן |
| ניהול משתמשים | **כן** | לא | לא | לא | לא |

הערה: widgets של הפילוח נגישים לכתיבה לכל משתמש מאושר במכוון — `proxy.ts:19–26` מתעד
זאת ("shared report configuration that viewers may save/delete too").

### 6.3 אכיפת scope גדודי

שלוש שכבות:

1. **ניווט** — `lib/auth/nav.ts:navLinksFor(user)` נגזר מהשורה המאומתת. `navLinksForView`
   יכול רק **להסיר** קישורים (מסתיר `/force-structure` ו-`/gaps` מתצוגה חטיבתית ללא גדוד
   נבחר), ולכן ה-cookie לא יכול להרחיב ניווט של אף אחד.
2. **עמודים** — `proxy.ts` + `isPathAllowedForScopedRole` (`lib/auth/battalion-scope.ts`).
   `BATTALION_SCOPED_SECTIONS` = `/calendar`, `/requests`, `/battalions`, `/reports`,
   `/force-structure`, `/gaps`. חריגה → redirect ל-`BATTALION_SCOPED_HOME = "/calendar"`.
3. **API** — `isApiAllowedForScopedRole` עם `BATTALION_SCOPED_API_PREFIXES`:
   `/api/me`, `/api/role`, `/api/notifications`, `/api/battalions`, `/api/requests`,
   `/api/reports`, `/api/certification-gaps`, `/api/force-structure`, `/api/gaps`,
   `/api/battalion`, `/api/roster`. כל השאר → 403 לתפקיד גדודי.

בתוך ה-handlers: `lib/auth/scope.ts` מספק `getBattalionScope()` (מחזיר null לתפקיד גלובלי
= ללא סינון), `denyOutOfScope(battalionId)` (**404** ולא 403 — "whether a row exists in
another battalion is itself not theirs to learn"), ו-`requireBattalionEditor(battalionId)`.
`NO_BATTALION_CODE = "__no_battalion__"` מבטיח fail-closed אם שורת הגדוד נעלמה.

#### שאילתות שמסננות לפי גדוד

| מסננות | לא מסננות (כוונה) |
|---|---|
| `getExportData(from, to, battalionCode)` — `lib/db/repositories/export.ts:62` | `listCertifications()` ללא `battalionCode` |
| `reports.ts` — כל שבעת הדוחות מקבלים `scopedId` | `getGapRowSnapshot` — **מחזיר כל הגדודים** |
| `runPivotReport` — `battalionIds` נחתך ל-scope (`app/reports/pivot/page.tsx:36`) | `listStatusHistory` — ללא scope |
| `listBattalionAllocations(battalionId, range?)` | `listTemplates`, `listTrainings` (reference data) |
| `getBattalionSummary(battalionId)` | |
| `listRosterForBattalionCertification(certId, battalionId)` | |
| `listComputedGaps(battalionId)`, `listGapKeys(battalionId)` | |
| `listCanvasRoles` / `listBankSoldiers` (לפי גדוד) | |

### 6.4 מקומות שבהם ה-UI וה-API אינם מסכימים

| מקום | UI | API |
|---|---|---|
| `canRegisterSoldier(role)` | `return true` תמיד | ה-API אוכף `canManageRosterEntry(user, battalionId)`. ה-predicate חסר משמעות — מטעה מי שיקרא אותו כשמירה |
| `canApproveRoster(role)` | עדיין מיוצא ומבוסס cookie | `/api/roster/[entryId]/status` **לא** משתמש בו יותר (עבר ל-`canManageRosterEntry`). ה-predicate נותר בקוד בלי צורך |
| `canManageCertifications(role)` | קובע כפתורים בתצוגה חטיבתית | 20 handlers מסתמכים עליו כ**שמירה** — ראה 5.1ב |
| `canEditAnything` / `canManageAnyRoster` | מציגים affordance | מתועדים במפורש כ"NOT AN AUTHORIZATION CHECK" |
| `/certifications/[id]` — פאנל נעילת הרשמה | מוצג רק אם `canManageCertifications(role) && canEdit(me)` | `PATCH /api/certifications/[id]` דורש `requireEditor` + cookie — עקבי |

---

## 7. Validation

38 סכמות Zod ב-14 קבצים תחת `lib/validation/`.

| סכמה | קובץ | תמצית | נצרך ב- |
|---|---|---|---|
| `certificationSchema` | `certification.ts:13` | ZodObject בסיס: `name`, `start_date`, `end_date`, `location`, `total_slots` (preprocess: `''` → null), `is_unlimited` (UI, לא נשמר), `gap_row_id`, `registration_open`, `registration_lock_date` (regex ISO), `registration_lock_hour` (int 0–23), `notes`, `color_hex` (regex hex), `prerequisites[]`, `quotas[]`, `taxes[]` | `POST /api/requests/[id]/open-certification` |
| `certificationCreateSchema` | `certification.ts:90` | `certificationSchema` + superRefine: קיבולת חובה אלא אם `is_unlimited`; `checkLockHourHasDate` | `POST /api/certifications` |
| `certificationPatchSchema` | `certification.ts:103` | `.partial()` + אותם refinements | `PATCH /api/certifications/[id]` |
| `certificationStatusSchema` | `certification.ts:116` | `status` enum + `note` | `PATCH /api/certifications/[id]/status` |
| `rosterEntrySchema` | `roster.ts:4` | חייל מלא | `POST /api/certifications/[id]/roster`, `PATCH /api/roster/[entryId]` |
| `battalionRosterEntrySchema` | `roster.ts:28` | וריאנט גדודי | `/api/battalions/[id]/certifications/[certId]/roster[/[entryId]]` |
| `rosterStatusSchema` | `roster.ts:32` | סטטוס + סיבה | `PATCH /api/roster/[entryId]/status` |
| `templateSchema` | `template.ts:6` | תבנית | `POST /api/templates`, `PATCH /api/templates/[id]` |
| `trainingSchema` | `training.ts:16` | הדרכה + sessions | `POST /api/trainings`, `PATCH /api/trainings/[id]` |
| `trainingSessionSchema` | `training.ts:5` | בלוק | `/api/trainings/[id]/sessions[/[sessionId]]` |
| `requestSchema` | `request.ts:22` | דרישה + `soldiers[]` | `POST /api/requests`, `PATCH /api/requests/[id]` |
| `requestStatusSchema` | `request.ts:37` | סטטוס דרישה | `PATCH /api/requests/[id]/status` |
| `requestSoldierSchema` | `request.ts:6` **וגם** `request-soldier.ts:5` | **מוגדר פעמיים** — ראה סעיף 11 | `POST /api/requests/[id]/soldiers` (מ-`request-soldier.ts`) |
| `influencingFactorSchema` | `influencing-factor.ts:3` | גורם משפיע | `/api/influencing-factors[/[id]]` |
| `traineeApprovalSchema` | `quota.ts:11` | `battalion_id` | `POST …/approve-trainees` |
| `certificationFileUploadSchema` | `certification-file.ts:35` | `original_name`, `mime_type` enum (PNG/JPEG/WEBP/PDF), `size_bytes` ≤ 4MB | `POST /api/certifications/[id]/files` |
| `certificationFileSchema`, `certificationFileWithUrlSchema` | `certification-file.ts:46,59` | צורת שורה/תשובה | טיפוסים בלבד |
| `pivotQuerySchema` | `pivot.ts:55` | `battalionIds[]`, `certificationIds[]`, טווח | `POST /api/reports/pivot` |
| `pivotWidgetConfigSchema` | `pivot.ts:62` | config של widget | `app/reports/pivot/page.tsx:37` (אימות JSONB בקריאה) |
| `pivotWidgetSaveSchema` | `pivot.ts:65` | `name` + config | `/api/reports/pivot/widgets[/[id]]` |
| `pivotWidgetIdSchema` | `pivot.ts:74` | UUID | `PATCH/DELETE …/widgets/[id]` |
| `pivotReportSchema` | `pivot.ts:114` | צורת תשובה | טיפוסים |
| `weeklyExportQuerySchema` | `battalion-export.ts:25` | `from`/`to` ISO + `to >= from` + תקרת `MAX_EXPORT_SPAN_DAYS = 31` | `GET /api/battalions/[id]/weekly-export` |
| `battalionIdParamSchema` | `battalion-export.ts:47` | coerce int חיובי | אותו route |
| `userPatchSchema` | `admin.ts:72` | `status`/`role`/`battalion_id` | `PATCH /api/admin/users/[id]` |
| `approveUserSchema`, `updateRoleSchema` | `admin.ts:54,63` | | טפסי אדמין |
| `loginSchema`, `signupSchema`, `resetRequestSchema`, `updatePasswordSchema` | `auth.ts:5,12,31,37` | טפסי auth (client-side) | `components/auth/*` |
| `assignmentCreateSchema`, `assignmentMoveSchema`, `bankSoldierSchema`, `soldierCertificationSchema`, `roleSeedSchema` | `force-structure.ts:43,59,69,82,96` | שניים לפנים | `POST /api/force-structure/assignments/[id]/move` (רק `assignmentMoveSchema` נצרך ב-route) |

### 7.1 Routes שקוראים גוף בקשה ללא סכמה

| route | מה נקרא ללא אימות |
|---|---|
| `POST /api/role` | `const { role } = await request.json()` — בדיקה ידנית של prefix בלבד |
| `POST /api/certification-gaps` | `certification_name` — בדיקת קיום ידנית |
| `PUT /api/certification-gaps/[rowId]/value` | גוף ללא סכמה |
| `PUT /api/certification-gaps/[rowId]/sent` | גוף ללא סכמה |
| `PATCH /api/taxes/[taxId]/fulfilled` | גוף ללא סכמה |
| `PATCH /api/templates/course/[name]` | גוף ללא סכמה |
| `POST /api/certifications/[id]/confirm-completion` | מערך `passedRosterIds` ללא סכמה |
| `POST /api/requests/[id]/link-certification` | גוף ללא סכמה |
| `PUT /api/gaps/[rowId]/key` | גוף ללא סכמה |
| `PUT /api/gaps/[rowId]/active-source` | גוף ללא סכמה |
| `POST /api/force-structure/bank/[id]/move` | גוף ללא סכמה |
| `POST /api/force-structure/edit-session[/[id]/revert]` | גוף ללא סכמה |
| `PUT/DELETE /api/roster/[entryId]/admin-confirmation` | גוף ללא סכמה |
| `POST/DELETE /api/gaps/[rowId]/nominations` | `createSchema` **מוגדר מקומית ב-route**, לא ב-`lib/validation/` |

**דרוש אימות:** לא בדקתי אם כל אחד מאלה אכן קורא `request.json()` או מסתמך על query
params בלבד; הרשימה נגזרה מהיעדר `*Schema` בקובץ.

---

## 8. UI map

### 8.1 עמודים

40 עמודים, 9 layouts. `app/layout.tsx` הוא ה-shell: RTL, Heebo, `MainNav`, `OpenTasksBar`
(רק לתצוגה חטיבתית ללא גדוד נבחר), `Toaster`, `RoleProvider`.

| נתיב | תפקיד | מי רואה |
|---|---|---|
| `/` | `app/page.tsx` — ניתוב פנימה | כולם |
| `/login`, `/signup`, `/reset-password`, `/update-password` | auth (`AuthCard`: לוגו + סלוגן) | ציבורי |
| `/pending` | "החשבון ממתין לאישור" | `status !== 'approved'` |
| `/calendar` | לוח שנה ראשי — ארבע תצוגות | כולם (בית לתפקיד גדודי) |
| `/certifications` | רשימת הסמכות + לשוניות | גלובלי בלבד |
| `/certifications/new`, `/certifications/[id]/edit` | טופס הסמכה | `canEdit` |
| `/certifications/[id]` | פרטי הסמכה: KPI, מיסים, פאנל הרשמה + ספירה לאחור לנעילה, roster, עתודה, קבצים, היסטוריה | גלובלי |
| `/certifications/[id]/print` | תצוגת הדפסה | גלובלי |
| `/certifications/[id]/roster/new`, `/[entryId]/edit` | טופס חייל | `canManageRosterEntry` |
| `/trainings`, `/trainings/new`, `/trainings/[id]`, `/[id]/edit` | הדרכות + בלוקים | גלובלי |
| `/templates`, `/templates/new`, `/templates/[id]/edit`, `/templates/course/[name]` | בנק הסמכות (מקובץ לפי שם קורס) | גלובלי |
| `/requests`, `/requests/new`, `/requests/[id]` | דרישות גדודים + מטריצת פערים ביחס לשיבוץ | כולם (גדודי רואה את שלו) |
| `/battalions` | אינדקס גדודים (מנתב תפקיד גדודי לשלו) | כולם |
| `/battalions/[code]` | דשבורד גדוד: KPI, הקצאות ממתינות לשמות, לוח שבועי + ייצוא PDF, מצבה, אישור שלישותי | גדודו / גלובלי |
| `/battalions/[code]/certifications/[certId]` | ההסמכה מזווית הגדוד: הקצאתו, חייליו, ספירה לאחור | גדודו / גלובלי |
| `/force-structure` | "שניים לפנים" — קנבס תקן/שיבוץ | גדודי + גלובלי עם גדוד נבחר |
| `/force-structure/pending-identity` | ממתינים למספר אישי/שם | אותו קהל |
| `/gaps` | פערים: מפתח חישוב, מקור פעיל, מועמדים | אותו קהל |
| `/reports` | דוח סיכום + ייצוא Excel/PDF | כולם (מסונן) |
| `/reports/other` | שש טבלאות דוח + ייצוא Excel לכל אחת | כולם (מסונן) |
| `/reports/pivot` | "פילוח הסמכות" + widgets שמורים | כולם (מסונן) |
| `/reports/battalion-roster` | חיילים לפי הסמכה וגדוד + Excel | כולם (מסונן) |
| `/notifications` | התראות | כולם |
| `/admin/permissions` | ניהול משתמשים | `super_admin` בלבד |

### 8.2 ניווט

`lib/auth/nav.ts` — `NAV_LINKS` בסדר תצוגה: `/calendar` (לוח שנה), `/trainings` (הדרכות),
`/certifications` (הסמכות), `/requests` (דרישות גדודים), `/templates` (בנק הסמכות),
`/battalions` (גדודים), `/force-structure` (שניים לפנים), `/gaps` (פערים), `/reports` (דוחות).
`ADMIN_LINK` = `/admin/permissions` נוסף ל-`super_admin`.

`BATTALION_ONLY_LINKS = ["/force-structure", "/gaps"]` — מוסתרים מתצוגה חטיבתית ללא גדוד.
`pointBattalionsAtOwn` מפנה את "גדודים" ישירות לגדוד של משתמש גדודי.

`RoleSwitcher` (`components/layout/role-switcher.tsx`) קורא ל-`POST /api/role`.

### 8.3 תצוגות לוח שנה

`components/calendar/`: `month-view.tsx`, `week-row.tsx` (שבועי), `agenda-view.tsx`,
`gantt-view.tsx`, `year-gantt-view.tsx`. `calendar-client.tsx` הוא ה-orchestrator,
`filter-bar.tsx` הסינון.

`CalendarItemKind` (`components/calendar/types.ts:31`) = `certification` | `training` |
`influencing_factor`. `calendarSortPriority` נותן ל-`influencing_factor` עדיפות 0 (מוצג ראשון).

**מה מוצג ומה לא:** `app/calendar/page.tsx:28` מסנן `c.status !== "cancelled"` — הסמכות
מבוטלות **אינן** על הלוח. הדרכות וגורמים משפיעים מוצגים ללא סינון סטטוס (אין להם סטטוס).
לתפקיד גדודי, ה-`href` של הסמכה מופנה ל-`/battalions/{code}/certifications/{id}` כי מקטע
ההסמכות אינו שלו.

### 8.4 טיפול באזור זמן

מקור אמת יחיד: `lib/utils/registration-lock.ts:33` — `APP_TIME_ZONE = "Asia/Jerusalem"`.

- `todayIsoDate(now?)` — `'yyyy-MM-dd'` בשעון ישראל דרך `Intl.DateTimeFormat("en-CA")`.
- `zoneOffsetMsAt(instant)` — היסט UTC בפועל באותו רגע, נגזר מ-`Intl` (לא כלל קשיח), כדי
  שמעברי שעון קיץ יגיעו ממסד ה-tz של הפלטפורמה.
- `zonedWallClockToInstant(y,m,d,h)` — שני מעברים: מתייחס לשעון הקיר כאילו הוא UTC, מחסר
  את ההיסט, ואז מתקן שוב לפי ההיסט **בתשובה**. שתי השעות הדו-משמעיות בשנה נפתרות
  דטרמיניסטית ומתועדות: מעבר קדימה (02:00 שאינו קיים) → 03:00; מעבר אחורה (01:00 פעמיים)
  → המופע **השני**.
- `lib/calendar/anchor.ts` — "היום" נפתר **בשרת** ומועבר ל-client כ-prop, כדי ש-HTML
  השרת והרינדור הראשון בדפדפן יהיו זהים (`app/calendar/page.tsx:62`,
  `components/calendar/calendar-client.tsx:34`).
- הייצוא ל-PDF חותם `generatedAt` בשעון ישראל ומציין זאת בטקסט
  (`app/api/battalions/[id]/weekly-export/route.ts:20`).
- תאריכים נשמרים כ-TEXT `'yyyy-MM-dd'`, ולכן השוואות לקסיקוגרפיות **הן** השוואות
  כרונולוגיות — בלי parsing ובלי אזור זמן באמצע.

### 8.5 אזורי `components/`

| תיקייה | תוכן |
|---|---|
| `ui/` | בסיס shadcn/Radix: `button`, `input`, `table`, `card`, `tabs`, `alert-dialog`, `collapsible`, `dropdown-menu`, `checkbox`, `label`, `textarea`, `sonner`, `date-range`, `kpi-card`, `color-select`, `time-combobox`, `badge` |
| `layout/` | `main-nav` (מיתוג + ניווט + סלוגן), `role-switcher`, `open-tasks-bar`, `chrome-gate` |
| `certifications/` | `certification-form`, `certifications-list-tabs`, `status-changer`, `status-badge`, `quota-registration-panel` (עורך נעילה + ספירה לאחור), `registration-lock-countdown`, `certification-files`, `certification-files-list`, `confirm-completion-panel`, `tax-list`, `delete-certification-button`, `slot-status-indicator`, `print-button` |
| `roster/` | `roster-table` (עם העתקה לכל שורה), `roster-form`, `copy-roster-button` |
| `battalions/` | `battalion-dashboard`, `battalion-summary`, `battalion-roster-panel`, `soldier-search` |
| `calendar/` | חמש התצוגות + `filter-bar` + `certification-chip` + `types` |
| `reports/` | `export-report-actions`, `export-report-body`, `export-excel-button`, `battalion-roster-report`, `pivot-*` |
| `force-structure/` | `force-structure-screen` (קנבס) ונלווים |
| `gaps/` | `gaps-screen` |
| `requests/`, `trainings/`, `templates/`, `influencing-factors/`, `admin/`, `auth/`, `audit/`, `notifications/`, `colors/` | טפסים ומסכים לפי דומיין |

---

## 9. Domain rules encoded in code

### 9.1 מפת מעברי סטטוס להסמכה

מקור אמת: `lib/certifications/transitions.ts:21` — `VALID_TRANSITIONS`.

| מ- | ל- |
|---|---|
| `draft` | `open`, `cancelled` |
| `open` | `full`, `closed`, `in_progress`, `cancelled` |
| `full` | `open`, `closed`, `in_progress`, `cancelled` |
| `closed` | `open`, `in_progress`, `cancelled` |
| `in_progress` | `completed`, `cancelled` |
| `completed` | — (סופי) |
| `cancelled` | — (סופי) |

נאכף ב-`lib/db/repositories/certifications.ts:253`; נצרך גם ע"י
`components/certifications/status-changer.tsx` דרך `allowedTransitionsFrom`, כך שהכפתורים
שה-UI מציע וההעברות שהשרת מקבל הם אותה מפה. `OPEN_FOR_REGISTRATION = "open"` מסומן בנפרד
כפעולה ראשית.

#### ★ נתיב שעוקף את המפה

`confirmCertificationCompletion` (`lib/db/repositories/certifications.ts:333`) כותב
`status = 'completed'` **ישירות**, ללא התייעצות ב-`VALID_TRANSITIONS`. הוא בודק רק שהסטטוס
אינו כבר `completed`/`cancelled`. ההערה ב-`lib/certifications/transitions.ts:15–19` מתעדת
זאת במפורש: קיימות תשע שורות `draft -> completed` ב-`status_history` על אף ש-`draft` מתיר
רק `open`/`cancelled`. מסומן שם כאי-עקביות מוכרת ומודעת.

מעברי דרישה: מפה **שנייה ונפרדת** ב-`lib/db/repositories/requests.ts:104` (לא מיוצאת):
`opened → in_review|rejected`; `in_review → approved|rejected|opened`;
`approved → certification_opened|closed`; `rejected → closed`;
`certification_opened → closed`; `closed → —`.

### 9.2 השלמה ברמת החייל מול סטטוס ההסמכה

שני מפלסים **נפרדים**:

- **רמת חייל**: `roster_entries.status` — `passed` / `failed` הם ההצהרה המחייבת.
- **רמת הסמכה**: `certifications.status = 'completed'` אומר שהמחזור נסגר, **לא** שחייל
  מסוים עבר.

`confirmCertificationCompletion` הוא הגשר: הוא מקבל `passedRosterIds`, מסמן כל שורה שאינה
ברשימה כ-`failed`, ואז סוגר את ההסמכה. הוא פועל **רק על `is_reserve = 0`**
(`certifications.ts:303`).

`lib/db/repositories/certification-pivot.ts:59` מצהיר במפורש: "The certification's own
status is never [used]" — הדוח נשען על סטטוס החייל בלבד. **לא נמצא מקום שמסיק מצב חייל
מסטטוס ההסמכה.**

### 9.3 עתודה (reserve) — היכן נספרת והיכן לא

| מקום | טיפול |
|---|---|
| `ACTIVE_ROSTER_STATUSES` + `is_reserve = 0` | **מוחרגת** מתפוסה ומקיבולת |
| `ALLOCATION_OPPORTUNITIES_SQL` (`battalion-dashboard.ts:193`) | **מוחרגת משתי הספירות** — ההערה: "a reserve soldier occupies no seat, so a cycle whose only names are reserve still has every seat open" |
| `countBattalionQuotaUsage` (`roster.ts:258`) | `is_reserve = 0` בלבד |
| `confirmCertificationCompletion` | `is_reserve = 0` בלבד |
| `listReserveForCertification` | רשימה נפרדת (`is_reserve = 1`) |
| `getBattalionQuotaUsage` | `reserve` מוחזר כשדה נפרד, לא מנוכה מהקיבולת |
| **דוח הפילוח** | **נכללת** — `lib/reports/pivot-counting-rule.ts:71`: `is_reserve` **אינו נבדק**; שורת עתודה עוברת אותו מבחן סטטוס. `reserve_count` מדווח **במקביל** וחופף לשלושת הדליים, ולעולם אינו מסוכם איתם |
| `battalion-dashboard.tsx:95` (`countedNames`) | `is_reserve === 0 && ACTIVE_ROSTER_STATUSES.includes(status)` |
| העתקה ל-WhatsApp | `is_reserve` **לא** ממופה ל-"מילואים/סדיר" — `lib/roster/copy-format.ts` מתעד שאלו מושגים שונים |

### 9.4 קיבולת, תפוסה והקצאה

`lib/utils/slots.ts`:
- `computeSlotsRemaining(totalSlots, registeredCount)` → `null` אם `totalSlots === null`
  (unlimited), אחרת `max(total - registered, 0)`.
- `ACTIVE_ROSTER_STATUSES = ['registered','pending_approval','approved','participated','passed','failed']`
  — שימו לב ש-`failed` **תופס מקום** (הוא השתתף), ו-`rejected`/`did_not_participate`/
  `did_not_report` אינם.

צרכני הקבוע: `certifications.ts:26`, `open-tasks.ts:36,55`, `roster.ts:258`,
`battalion-summary.ts:100`, `battalion-dashboard.ts:31` (כ-`COUNTED_STATUSES`),
`battalion-dashboard.tsx:95`.

`lib/battalions/open-allocations.ts`:
- `remainingAllocatedSlots(allocated, registered)` → `null` כשאין הקצאה (**לא** 0 —
  ההערה מסבירה ש-0 יגרום להסמכה ללא הקצאה להיראות מלאה).
- `isOpenAllocation(row)` — סטטוס ב-`OPEN_ALLOCATION_STATUSES = ['open','full','in_progress']`,
  `allocated_slots` לא null ולא ≤ 0, ונשארו מקומות.
- `openAllocationsOf` מצמצם את הטיפוס ל-non-null אחרי הסינון.
- `isAwaitingNames({has_quota, registered})` — `has_quota && registered === 0`, מצב הענבר.

`lib/db/repositories/roster.ts:eligibilityOf` + `ELIGIBILITY_SQL:315` — **הצהרת הזכאות
המשותפת** ל-`getBattalionQuotaUsage` (שמרנדר את הפאנל) ול-`addBattalionRosterEntry`
(שמאשר את הכתיבה), "so the button and the endpoint cannot disagree about whether a seat
exists". שני מצבים: `mode = 'open_to_all'` (אף גדוד לא מחזיק הקצאה → הבריכה היא
`total_slots`) או `'battalion_quota'` (קיימת הקצאה כלשהי → נספרת ההקצאה של הגדוד).

`listBattalionAllocations` נכלל בהסמכה אם **או** קיימת שורת `certification_battalion_quotas`
לגדוד **או** קיימת שורת `roster_entries` שלו. הדדופליקציה מובנית (UNIQUE על הזוג + subquery
מקובץ), לא `DISTINCT`.

### 9.5 נעילת הרשמה

`lib/utils/registration-lock.ts` — `registration_lock_date` + `registration_lock_hour`
נפתרים ל-**רגע** אחד:
- `hour = H` → נסגר ב-H:00 שעון ישראל באותו תאריך.
- `hour = NULL` → סוף יום הנעילה (שעה 24) = הסמנטיקה שלפני 022. זו הסיבה ש-022 לא נזקק
  ל-backfill.
- הגבול **כולל את הרגע**: `now >= moment` = נעול.
- `isRegistrationLocked(lock, now)` מחזיר `false` כשאין דדליין — "the absence of a deadline
  must never read as a passed one".

אכיפה בשרת: `roster.ts:174` (`addRosterEntry`), `roster.ts:322` (`addBattalionRosterEntry`,
בתוך אותה transaction כמו ה-INSERT ועם `FOR UPDATE` על שורת ההקצאה),
`app/api/certifications/[id]/quotas/[battalionId]/approve-trainees/route.ts:51`.
`REGISTRATION_LOCKED_MESSAGE` — נוסח סירוב אחד.

### 9.6 חישוב פערים (פערים)

מקור: VIEW `v_certification_gaps` (`migrations/postgres/015_gap_requirement_keys.sql:258`).

- **required** = `SUM(gap_requirement_keys.qty × v_org_unit_counts.unit_count)` עבור
  ה-`active_source` הפעיל. ה-`COALESCE` נמצא **בתוך** ה-`SUM` במכוון — מחוצה לו,
  `unit_type` אחד שאינו מותאם היה מאפס addend ומדווח בחסר.
- **held** = `COUNT(DISTINCT soldier_certifications.personal_number)` בחיתוך עם
  `role_assignments` של אותו גדוד (דרך `roles` → `companies`). DISTINCT כדי שחייל בשני
  תקנים ייספר פעם אחת.
- **active_source** = `COALESCE(certification_gap_values.active_source, certification_gap_rows.active_source)`,
  אחד מ-`'operational'` / `'establishment'`.
- רק גדודים עם `is_active = 1`.

**מתי מתעדכן:** ה-VIEW מחושב חי בכל קריאה. בנוסף,
`confirmCertificationCompletion` (`certifications.ts:318`) מפחית ידנית את
`certification_gap_values.gap_count` ב-`GREATEST(gap_count - passedCount, 0)` לכל גדוד,
**רק אם** ל-`certifications.gap_row_id` יש ערך, **ורק** על סטטוס `passed` מפורש.

`GAP_BATTALION_CODES` (`certification-gaps.ts:151`) = `["5030","8207","9308","6228","gdsm","hq"]` —
קבוע קשיח שקובע את יריעת הגדודים במטריצת `/requests`.

### 9.7 דוח הפילוח — נספר מול מוחרג

מקור אמת: `lib/reports/pivot-counting-rule.ts`. **שלושה דליים, לא שניים.**

| קבוע | ערכים |
|---|---|
| `COUNTED_ROSTER_STATUSES` | `approved`, `registered`, `passed`, `participated` |
| `EXCLUDED_ROSTER_STATUSES` | `failed`, `did_not_report`, `did_not_participate` |
| `unrecognized` | כל השאר: NULL, מחרוזת ריקה, ערך legacy — **לעולם לא נספר** |

הקובץ מצהיר במפורש שזו **אינה** הכלל המערכתי: `ACTIVE_ROSTER_STATUSES` ב-`lib/utils/slots.ts`
נותר הכלל לתפוסה ולמתמטיקה של הקצאות, ומנגנון הפערים מפחית רק על `passed` מפורש. אף אחד
מהם אינו מייבא מ-`lib/reports/pivot-counting-rule.ts`, והמודול ממוקם תחת `lib/reports/`
ונקרא על שם הדוח **במכוון**, "a generic name in a generic folder is how a report-specific
rule ends up silently governing capacity math".

הערה: `failed` **נספר** ב-`ACTIVE_ROSTER_STATUSES` (תופס מקום) אך **מוחרג** בדוח הפילוח.
זו אי-התאמה מכוונת ומתועדת בין שני הכללים.

`PIVOT_COUNT_LABELS` — "נספרו"/"לא נספרו" (ולא "השלימו"), כי הדלי הנספר כולל סטטוסים
בתהליך. מכנה: `total_count = counted + excluded + unrecognized`, כולל עתודה.
`reserve_count` חופף ואינו חלק מהחלוקה. צרכנים: `lib/db/repositories/certification-pivot.ts`,
`components/reports/pivot-*`, `tests/reports/pivot-counting-rule.test.ts`,
`tests/reports/pivot-summary.test.ts`.

### 9.8 טריגרים להתראות

`createNotification` נקרא מ-8 מקומות:

| מקום | טריגר | `type` | `target_role` |
|---|---|---|---|
| `certifications.ts:269` | שינוי סטטוס ל-`open`/`closed`/`cancelled`/`completed` | `certification_changed` / `registration_closed` / `certification_cancelled` | `battalion:all` |
| `certifications.ts:337` | אישור סיום הסמכה | `certification_changed` | `battalion:all` |
| `requests.ts:74` | יצירת דרישה | — | חטיבה |
| `requests.ts:206` | פתיחת הסמכה מדרישה | `opened_from_request` | — |
| `roster.ts:230` | הוספת חייל | `soldier_added` | — |
| `roster.ts:536` | שינוי סטטוס חייל | `soldier_approved` / `soldier_rejected` | — |
| `roster.ts:584` | `approveTraineeList` | — | — |
| `users.ts:58` | הרשמת משתמש חדש | `user_registered` | `SUPER_ADMIN_NOTIFICATION_ROLE` |

**דרוש אימות:** לא פירקתי כל אחד מהשמונה לערכי `type`/`target_role` המדויקים; ארבעה
מהם נגזרו מהקשר ולא נקראו בשלמותם.

### 9.9 כתיבות ל-`status_history`

`recordStatusChange(entityType, entityId, oldStatus, newStatus, changedByRole, note?, client?)`
(`lib/db/repositories/audit.ts`). `entity_type` אחד מ-`'certification'`, `'battalion_request'`,
`'roster_entry'` (`lib/types.ts:102`).

נקרא מ-: `certifications.ts` (יצירה, שינוי סטטוס, אישור סיום — כולל שורה לכל roster entry),
`requests.ts` (שינוי סטטוס דרישה), `roster.ts` (שינוי סטטוס חייל, `approveTraineeList`).

`changed_by_role` — הערך מגיע מ-`auditRoleOf(user, battalionCode)` ב-routes שעברו הקשחה
(מייצר `"brigade"` או `"battalion:CODE"` מהשורה המאומתת), אך ב-routes מבוססי-cookie הוא
עדיין מגיע מ-`getCurrentRole()`. `auditRoleOf` מתעד שהעמודה מכילה כבר 707 שורות `"brigade"`,
ולכן אוצר המילים נשמר.

---

## 10. Reports and exports

| דוח | עמוד | מקור נתונים | סינונים | סינונים **חסרים** | ייצוא |
|---|---|---|---|---|---|
| סיכום הסמכות והדרכות | `/reports` | `getExportData(from, to, scope?.code)`, `getTrainingExportData` | טווח תאריכים; גדוד (**כפוי** לתפקיד גדודי) | סטטוס הסמכה, תחום (domain), גדוד כבחירה לגלובלי | Excel (`export-report-actions.tsx:91`) + PDF (`exportElementToSinglePagePdf`) |
| שש טבלאות דוח | `/reports/other` | `reports.ts`: `certificationsByMonth`, `openForRegistration`, `completedCertifications`, `openRequestsByBattalion`, `gapsByBattalion`, `rosterCounts` | גדוד (כפוי לגדודי, `scopedId`) | **אין טווח תאריכים, אין סינון סטטוס, אין בחירת גדוד לגלובלי** | Excel לכל טבלה (`export-excel-button.tsx`), שמות קבצים באנגלית: `certifications_by_month`, `open_for_registration`, `completed_certifications`, `open_requests_by_battalion`, `gaps_by_battalion`, `roster_counts` |
| פילוח הסמכות | `/reports/pivot` | `runPivotReport` (`certification-pivot.ts`) | גדודים, הסמכות, טווח תאריכים; widgets שמורים | תחום כסינון ראשי (יש `listDomainsWithCertifications` כעזר) | דרך רכיבי `pivot-*` |
| חיילים לפי הסמכה וגדוד | `/reports/battalion-roster` | `battalionRosterReport` | גדוד (כפוי לגדודי, נבחר לגלובלי, ברירת מחדל = כל הגדודים) | טווח תאריכים, סטטוס | Excel — `חיילים_לפי_הסמכה_וגדוד.xlsx` (`battalion-roster-report.tsx:117`) |
| עדכון שבועי לגדוד | `/battalions/[code]` (כפתור) | `listBattalionAllocations(id, {from,to})` + `listAllocationOpportunities` | שבוע מוצג, גדוד מה-path | — | **PDF שרת** — `GET /api/battalions/[id]/weekly-export` |
| ייצוא רשימת הסמכה | `/certifications/[id]/print` | `getCertificationById` + roster | — | — | הדפסה/PDF |
| גאנט שנתי | `/calendar` (תצוגת שנה) | `calendarItems` | שנה | — | PDF — `גאנט_חטיבה_228_${year}.pdf` (`year-gantt-view.tsx:86`) |

### 10.1 עברית RTL וגופנים בייצוא

**Excel** — `xlsx@^0.18.5`, נטען דינמית (`await import("xlsx")`) בכל הצרכנים.
`XLSX.utils.json_to_sheet` עם מפתחות עבריים; שם הגיליון עברי
(`battalion-roster-report.tsx:120`). **אין טיפול גופן או RTL** — Excel קובע כיווניות
לפי תוכן התא ולפי הגדרות המשתמש. אין `!cols` / `!dir` בשום מקום.

**PDF — שני מסלולים שונים לגמרי:**

1. **צד לקוח (רסטר)** — `lib/utils/export-pdf.ts` + `lib/utils/pdf-capture.ts` +
   `html2canvas-pro` + `jspdf`. מצלם DOM אמיתי, ולכן העברית וה-RTL **נכונים מעצם זה
   שהדפדפן רינדר אותם**. אין הטבעת גופן. משמש את `/reports`, הגאנט השנתי,
   `battalion-roster-report`, `export-report-body`. הרכיבים הללו מכילים
   `eslint-disable-next-line @next/next/no-img-element` — `<img>` ידני נדרש כי
   `next/image` לא נלכד ע"י html2canvas.

2. **צד שרת (וקטור)** — `lib/pdf/weekly-certifications.ts`. jsPDF עם **Heebo מוטבע**:
   `lib/pdf/fonts/heebo-regular.ts` + `heebo-bold.ts`, TTF ב-base64 (~57KB ו-58KB),
   נוצרים ע"י `scripts/make-pdf-fonts.mjs`. הבחירה ב-base64 בתוך מודול (ולא קריאת קובץ)
   מתועדת: import הוא תלות קשיחה שה-bundler לא יכול לפספס, בעוד `fs.readFile` על
   `public/fonts` תלוי ב-file tracing.

   **שני דברים מחזיקים את העברית שם:**
   - הטבעת גופן — ל-14 גופני ה-PDF הסטנדרטיים אין גליפים עבריים כלל.
   - `doc.setR2L(true)` — קורא ל-bidi engine של jsPDF ומפיק סדר חזותי. `drawRight()`
     מחליף את הדגל **לכל מחרוזת בנפרד**, כי מנוע ה-bidi הופך רצף שאין בו תו RTL חזק:
     תא שמכיל רק `"24.08.2026"` נצבע `"6202.80.42"`. תיקון מתועד ומגובה בבדיקה.

   שם הקובץ ב-`Content-Disposition` כולל `filename` ASCII **וגם** `filename*=UTF-8''`
   (RFC 5987), כי שם עברי בפרמטר הפשוט מתעוות בחלק מהלקוחות.

---

## 11. Known issues, tech debt, and risks

מדורג לפי חומרה.

| # | issue | evidence | impact | suggested fix scope |
|---|---|---|---|---|
| 1 | **20 handlers מאשרים מה-`active_role` cookie בלבד**, ו-`POST /api/role` מאפשר לכל אחד לקבוע אותו | `app/api/role/route.ts`; `app/api/{certifications,templates,trainings,taxes,certification-gaps,requests}/…` — רשימה מלאה ב-5.1ב | אישור מבוסס ערך בשליטת הלקוח. בפועל חסום ע"י `proxy.ts`, אך זו נקודת כשל אחת | הוסף `requireEditor()`/`requireApprovedUser()` בתחילת כל handler; השאר את בדיקת ה-cookie כ-scope. התבנית קיימת כבר ב-`requireCertificationManager` |
| 2 | **בלוק אכיפת התפקיד ב-proxy עטוף ב-`try/catch` שממשיך בשקט** | `proxy.ts:60` (`try`) עד `:131` (`catch { }` עם "Best-effort gate; fall through and let page/handler guards enforce") | תקלת DB/timeout ב-`getUserById` מבטלת את אכיפת התפקיד לכל הבקשות; ל-29 ה-handlers מ-5.1 אין guard משלהם | fail-closed: החזר 503 במקום להמשיך, או לפחות עבור `WRITE_METHODS` ו-`/api/admin` |
| 3 | **9 handlers ללא כל שמירה** | `app/api/audit/route.ts`, `app/api/certification-gaps/[rowId]/snapshot/route.ts`, `app/api/notifications/[id]/read/route.ts`, `app/api/role/route.ts`, `app/api/certifications/route.ts:14`, `app/api/certifications/[id]/route.ts:45`, `app/api/templates/route.ts:7`, `app/api/templates/[id]/route.ts:7`, `app/api/trainings/route.ts:7`, `app/api/trainings/[id]/route.ts:13` | קריאה ללא בדיקה ברמת ההאנדלר; `snapshot` מחזיר נתוני **כל** הגדודים | `requireApprovedUser()` לכל אחד; ל-`snapshot` להוסיף `denyOutOfScope` או סינון scope |
| 4 | **`PATCH /api/notifications/[id]/read` פטור גם מ-proxy** | `app/api/notifications/[id]/read/route.ts`; `proxy.ts:22–27` (`API_ALLOW_ANY` כולל `/api/notifications`) | כל משתמש מאושר, כולל `viewer` וכולל תפקיד גדודי, יכול לסמן כל התראה של כל אחד | אמת בעלות: הצלב את `notifications.target_role` עם ה-scope של הקורא |
| 5 | **`confirmCertificationCompletion` עוקף את מפת המעברים** | `lib/db/repositories/certifications.ts:333`; מתועד ב-`lib/certifications/transitions.ts:15–19` | קיימות תשע שורות `draft -> completed` ב-`status_history`. סטטוס לא עקבי, והמפה אינה הכלל היחיד | החלטה מודעת נדרשת: או להעביר דרך המפה (ולבדוק אילו אישורים יידחו), או להוסיף מעבר `draft -> completed` מפורש |
| 6 | **N+1 בשלושה מסלולים חמים** | `lib/db/repositories/export.ts:67` (5N), `app/calendar/page.tsx:35,41,45`, `app/reports/pivot/page.tsx:36` (דוח שלם per widget) | לוח השנה הוא עמוד הבית בפועל; `/reports` מזין את הייצוא. מספר השאילתות גדל לינארית עם ההסמכות | שאילתה מקובצת אחת עם `certification_id = ANY($1)` — התבנית תוקנה כבר ב-`listBattalionAllocations` |
| 7 | **`certifications.status`, `battalion_requests.status`, `users.status`, `notifications.type` ללא CHECK** | `migrations/postgres/001_init.sql:47,109,119`; `004_users.sql` | הבעיה שמיגרציה 023 באה לפתור עבור `roster_entries.status` קיימת בארבע עמודות נוספות. שורה עם ערך זר אינה נחסמת | מיגרציה חדשה בתבנית 023 (בדיקה מקדימה + EXCEPTION, בלי לנחש) |
| 8 | **`canRegisterSoldier(role)` מחזיר `true` תמיד** | `lib/auth/permissions.ts` (סוף הקובץ) | predicate שנראה כשמירה ואינו שומר דבר. מי שיקרא לו בהנחה שהוא בודק — לא יקבל שגיאה | מחק אותו, או החלף ב-`canManageRosterEntry(user, battalionId)` |
| 9 | **`canApproveRoster(role)` הפך למת** | `lib/auth/permissions.ts`; `app/api/roster/[entryId]/status/route.ts:12` מזכיר אותו רק בהערה כ-gate הקודם | קוד מת שנראה חי; מזמין שימוש חוזר שגוי | מחק |
| 10 | **`requestSoldierSchema` מוגדר פעמיים** | `lib/validation/request.ts:6` ו-`lib/validation/request-soldier.ts:5` | שתי צורות לאותה ישות; אחת יכולה לזוז בלי השנייה | אחד את השתיים, השאר export יחיד |
| 11 | **14 handlers קוראים גוף בקשה ללא סכמת Zod** | רשימה מלאה ב-7.1 | קלט לא מאומת מגיע ל-repository; אין 400 עקבי | סכמה לכל אחד ב-`lib/validation/` |
| 12 | **`createSchema` מוגדר בתוך route** | `app/api/gaps/[rowId]/nominations/route.ts` | חורג מהמבנה — כל שאר הסכמות ב-`lib/validation/` | העבר ל-`lib/validation/` |
| 13 | **שתי טבלאות מתות** | `system_settings` **[017]** (אפס הפניות); `certification_gap_snapshots` **[018]** (מתועד "DELIBERATELY UNWIRED") | סכימה שמבטיחה יכולת שאינה קיימת. גרף המגמה (§1.6 בספק) לא מחובר | או לחווט או להסיר במיגרציה חדשה; לתעד את הבחירה |
| 14 | **סדרת מיגרציות SQLite נטושה בשורש `migrations/`** | `migrations/0001_init.sql`, `0002_add_battalions_and_taxes.sql`, `0003_reserve_and_hq.sql` מול `scripts/migrate-postgres.ts:15` שקורא רק מ-`migrations/postgres/` | שלושה קבצים שנראים כמיגרציות פעילות ואינם מורצים כלל. סיכון בלבול לכל מי שמצטרף | העבר ל-`migrations/legacy-sqlite/` + README |
| 15 | **`.env.example` מכיל URL אמיתי של פרויקט** | `.env.example` — `NEXT_PUBLIC_SUPABASE_URL="https://lwhxfjdwbwfxdnpilgeo.supabase.co"` | חשיפת מזהה פרויקט ב-repo. ה-anon key עצמו הוא placeholder, וה-URL אינו סוד בפני עצמו (הוא נשלח לדפדפן), אך אינו שייך לקובץ example | החלף ב-placeholder |
| 16 | **`PROJECT_OVERVIEW.md` מתאר מודל הרשאות מיושן** | `PROJECT_OVERVIEW.md:11–17` ("שני סוגי משתמשים", מחליף התפקיד כמנגנון הרשאות) מול `lib/types.ts:110` (חמישה תפקידים) ו-`lib/auth/permissions.ts` | קורא חדש יסיק שה-cookie הוא ציר ההרשאות | עדכן; הפנה למסמך זה |
| 17 | **`getCurrentRole()` מחזיר `"brigade"` כברירת מחדל** | `lib/auth/current-role.ts` — cookie חסר/לא תקין → `"brigade"` | fail-**open** לכיוון התפקיד המרשה ביותר. מזיק במיוחד בשילוב עם סיכון 1 | ברירת מחדל בטוחה, או החזר `null` וכפה על הקורא להחליט |
| 18 | **ענף `NODE_ENV` חסר משמעות** | `lib/db/client.ts:22–27` — `if (NODE_ENV !== "production") { global.__pgPool = pool } else { global.__pgPool = pool }` — שני הענפים זהים | קוד מטעה; נראה כאילו יש התנהגות שונה בפרודקשן ואין | פשט לשורה אחת |
| 19 | **`shadcn` ב-dependencies ולא ב-devDependencies** | `package.json` — `"shadcn": "^4.13.0"` תחת `dependencies` | CLI נכנס ל-bundle של הפרודקשן ללא צורך | העבר ל-devDependencies |
| 20 | **`next.config.ts` ריק** | `next.config.ts` | אין `outputFileTracingIncludes`. כרגע לא מזיק (גופני ה-PDF ב-base64 בתוך מודול), אך כל נכס עתידי שייקרא מ-`fs` בזמן ריצה ייכשל בשקט ב-Vercel | הוסף בעת הצורך; לתעד את התלות |
| 21 | **`certifications.origin_request_id` ללא FK** | `migrations/postgres/001_init.sql:49` — `origin_request_id INTEGER` ללא `REFERENCES` | יכול להצביע על דרישה שנמחקה. שאר העמודות הדומות כן מוגבלות | הוסף FK עם `ON DELETE SET NULL` |
| 22 | **`battalion_request_soldiers` מול `roster_entries` — שני מודלים לאותו דבר** | `008_request_soldiers_and_registration_lock.sql` יצר את הטבלה; `011_roster_request_link.sql` מצהיר "request-stage soldiers live in the existing `roster_entries` table" | שני מקומות אפשריים לחייל בשלב דרישה. `request-soldiers.ts` ו-`roster.ts:addRequestRosterEntries` שניהם קיימים | קבע מקור אמת אחד ותעד; ייתכן ש-008 מיושן דה-פקטו |

### 11.1 תוצאות ה-grep שהתבקשו

| דפוס | מופעים |
|---|---|
| `TODO` | **0** |
| `FIXME` | **0** |
| `HACK` / `XXX` | **0** |
| `@ts-ignore` | **0** |
| `@ts-expect-error` | 1 — `tests/roster/copy-format.test.ts:214`, שימוש לגיטימי (מוכיח שטיפוס נדחה) |
| `eslint-disable` | 5 — `lib/db/client.ts:4` (`no-var` ל-singleton של ה-pool) ו-4× `@next/next/no-img-element` ב-`components/calendar/year-gantt-view.tsx:125`, `app/requests/page.tsx:95`, `components/reports/export-report-body.tsx:159`, `components/reports/battalion-roster-report.tsx:202` — כולם נדרשים ל-html2canvas |
| `as any` / `: any` ב-routes | **0** |
| `as unknown as` | 1 — `app/api/battalions/[id]/weekly-export/route.ts:117` (`pdf as unknown as BodyInit`), עקיפת טיפוסים לגיטימית ב-Next |
| `active_role` / `getCurrentRole` | ראה 5.1 — 20 handlers מאשרים דרכו |

בסיס הקוד נקי במיוחד מבחינת סמני חוב קלאסיים: הערות ההסבר בקוד מתעדות החלטות ואי-עקביויות
מוכרות (למשל עקיפת מפת המעברים) במקום להשאיר `TODO`.

### 11.2 בדיקות

19 קבצי בדיקה תחת `tests/`: `auth/` (2), `battalions/` (5), `calendar/` (1),
`certifications/` (2), `db/` (1), `force-structure/` (3), `gaps/` (2), `reports/` (2),
`roster/` (1). `tests/db/status-parity.test.ts` מתחבר למסד אמיתי.

אין בדיקות ל: אישור ה-routes מבוססי-cookie, `confirmCertificationCompletion`, שכבת
ה-proxy, או סכמות Zod של הדרישות/התבניות/ההדרכות.

---

## 12. Open questions / needs verification

1. **תוכן מסד הנתונים בפועל** — לא בוצעה שאילתה. לא ניתן לאמת: כמה שורות `roster_entries`
   מחזיקות סטטוס לא מזוהה (הדלי ה-`unrecognized` של הפילוח), האם מיגרציה 023 אכן עברה
   בפרודקשן, האם קיימות שורות `certification_battalion_quotas.registration_lock_at`
   שנותרו, ומה מצב `users.role` בפועל.
2. **תשע שורות `draft -> completed`** — הערת `lib/certifications/transitions.ts:16` מצטטת
   מספר זה. לא אומת מול `status_history`.
3. **האם מיגרציות 022/023/024 הורצו בפרודקשן** — הרנר אידמפוטנטי, אך אין טבלת
   `schema_migrations` ולכן אין דרך לדעת מהקוד מה הוחל.
4. **`type` ו-`target_role` המדויקים בארבעה טריגרי התראה** — `requests.ts:74`,
   `requests.ts:206`, `roster.ts:230`, `roster.ts:584` לא נקראו בשלמותם (סעיף 9.8).
5. **אילו מבין 14 ה-handlers חסרי הסכמה אכן קוראים `request.json()`** — הרשימה ב-7.1
   נגזרה מהיעדר `*Schema` בקובץ, לא מקריאת כל גוף פונקציה.
6. **`components/**` לא נסרק ברמת עלה** — לפי ההנחיה סוכם לפי אזור. ייתכנו בדיקות
   הרשאה או לוגיקת דומיין בתוך רכיבים שלא נכללו כאן.
7. **`system_settings`** — האם נועדה לחלון סגירת ההרשמה (§1.7 בספק) ונזנחה, או שהיא
   מיועדת לשימוש עתידי. הכוונה אינה נגזרת מהקוד.
8. **`org_unit_type_patterns` / `org_unit_type_members`** — בשימוש דרך VIEWs. לא אימתתי
   שכל ה-patterns המוגדרים אכן מותאמים לנתונים בפועל (`uses_manual_unit_count` ב-VIEW
   מרמז שיש נפילות ל-manual).
9. **`certification_aliases`** — מוזכר ב-`lib/import/`. לא ברור אם ה-`kind = 'quarantine'`
   נאכף בזמן ריצה או רק בייבוא.
10. **מקורות הרשאה של Supabase Storage** — `lib/storage/*` משתמש ב-service_role.
    לא בדקתי אם ל-bucket `certification-files` מוגדרות RLS policies בצד Supabase
    (מחוץ ל-repo).
11. **`.env.local` בפועל** — לא נקרא (מכיל סודות). האמור בסעיף 2 מבוסס על `.env.example`
    ועל הפניות `process.env` בקוד.
