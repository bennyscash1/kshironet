# Multi-brigade tenancy — current state

This document is the roadmap you read when the system refuses to let you create
something. It is written to be accurate rather than reassuring: if an entity is blocked,
the exact condition that releases it is stated, and where the system is still unsafe that
is stated too.

**Last updated:** slice 1E (migration `027_unscoped_entity_guard.sql`).

---

## Where tenancy actually stands

| Layer | State |
| --- | --- |
| `brigades` | Exists. Created, renamed and deactivated from `/admin/brigades`. Never deleted. |
| `battalions` | **Scoped.** `brigade_id NOT NULL`, FK `ON DELETE RESTRICT`, `UNIQUE (brigade_id, code)`. A code may repeat across brigades. |
| Everything else (40 tables) | **Not scoped.** No `brigade_id`. |
| Row Level Security | Not present. Zero policies, zero `ENABLE ROW LEVEL SECURITY`. |
| Application database role | Not in use. The app still connects as `postgres`, which has `BYPASSRLS`. |
| Tenant context | Not implemented. No `app.brigade_id`, no per-request context. |

So brigades and battalions are genuinely isolated. Nothing else is.

---

## What is blocked, and exactly when

Six tables carry a `BEFORE INSERT` trigger (`unscoped_entity_write_is_blocked()`), which
refuses **creation** when **both** of these are true:

1. more than one **active** brigade exists (`SELECT count(*) FROM brigades WHERE is_active = 1`), and
2. `system_settings.multi_brigade_isolation_ready` is not `'1'`.

| Table | Hebrew | Created from |
| --- | --- | --- |
| `certifications` | הסמכות | `POST /api/certifications`, `POST /api/requests/[id]/open-certification` |
| `certification_templates` | תבניות הסמכה | `POST /api/templates`, `PATCH /api/templates/course/[name]` |
| `certification_gap_rows` | שורות פערים | `POST /api/certification-gaps` (no UI caller — see below), `scripts/seed-template-bank.ts`, `scripts/seed-6228-gap-keys.ts` |
| `trainings` | הדרכות | `POST /api/trainings` |
| `influencing_factors` | גורמים משפיעים | `POST /api/influencing-factors` |
| `soldier_certifications` | הסמכות שבידי חיילים | `lib/import/write-force-structure.ts` (force-structure import) |

The block is at the **database** level, so it applies to scripts and ad-hoc SQL as well as
to the API. The API translates it to a Hebrew 409 via `unscopedBlockFailure()`; SQLSTATE is
`KS002` and the offending table arrives as `err.table`.

### The two ways it is released

- **Deactivate a brigade** so exactly one remains active. Immediate, reversible, and the
  intended escape hatch — the condition counts *active* brigades, not rows.
- **Finish isolation and flip the flag** in migration `034`. That is the permanent route
  and it is gated on the checklist below, not merely on the migration running.

### `UPDATE` and `DELETE` are never blocked

Only `INSERT`. Existing rows stay fully viewable and editable with two brigades present.
This is deliberate and load-bearing: `replacePrerequisites` and `replaceTaxes`
(`lib/db/repositories/certifications.ts`) implement *editing* as `DELETE` + `INSERT` on
child tables, so blocking those tables would block ordinary editing.

---

## Why creation is blocked at all — the measured reason

With 2 brigades, 3 battalions and every domain table empty, inserting **one**
`certification_gap_rows` row produced **3 rows in `v_certification_gaps`, spanning both
brigades**. `v_certification_gaps` does `CROSS JOIN battalions` with no brigade predicate,
so one unscoped row is enough to merge two brigades' numbers.

There is no error when this happens. The פערים tab simply shows one shared figure. That is
the failure mode the block exists to prevent, and it is why the block is not merely
cautious.

---

## What is NOT blocked but is still shared between brigades

These are known states, not oversights. Nothing refuses them, and with two brigades they
behave as described.

| Table | Rows | Consequence with two brigades |
| --- | --- | --- |
| `system_settings` | 4 | **Operational, not cosmetic.** Both brigades share `registration_close_days` (7), `registration_close_warn_days` (3) and `bank_capacity_pct` (120). These drive registration locking and bank capacity, so one brigade cannot configure them independently. |
| `certification_families` | 5 | Shared colour families for the gaps tab. A rename or recolour by either brigade applies to both. |
| `certification_aliases` | 8 | Shared name-normalisation map. Note two seeded `quarantine` rows contain real personal names carried over from earlier data. |
| `course_colors` | 0 | Empty. The first colour either brigade assigns becomes shared. |
| `pivot_report_widgets` | 0 | Empty. Saved report widgets are global by design and their `config` JSONB embeds raw battalion and certification ids, which no constraint can police. |
| `role_reference` | 0 | Empty. The establishment (תקן) reference is shared by design. |
| `org_unit_types`, `org_unit_type_members`, `org_unit_type_patterns`, `drone_models` | 13 / 2 / 7 / 9 | Shared reference vocabulary. `org_unit_type_patterns` was *decided* to become per-brigade (private copy seeded at brigade creation, no fallback) but that is not implemented yet — today all brigades match against the same patterns, so a brigade whose workbooks use different Hebrew labels silently computes `required = 0`. |

`notifications` and `status_history` are also unscoped. They are not blocked because they
are written as side effects inside other transactions (`ensureUser` raises a signup
notification; every status change records history), so blocking them would break signup and
every status transition. With two brigades they are shared, and no constraint can prevent a
notification being filed under the wrong brigade.

---

## Known-unsafe paths with two brigades

These are not blocked by anything and will produce wrong results. Treat them as
unavailable until tenancy lands.

1. **The force-structure import** (`lib/import/write-force-structure.ts:29`). It resolves a
   battalion with `SELECT id FROM battalions WHERE code = $1` through `queryOne`. Now that
   codes are unique only *per brigade*, that can match several rows and take an arbitrary
   one — attaching an entire brigade's companies, roles and soldiers to the wrong brigade.
   `soldier_certifications` is blocked, which stops part of it, but `companies`, `roles`,
   `role_assignments` and `bank_soldiers` are not.
2. **`getBattalionByCode()`** (`lib/db/repositories/battalions.ts`) has the same ambiguity
   for the same reason. Every current caller runs in a single-brigade context.
3. **`v_org_unit_counts_base` and `v_org_unit_counts`** return rows proportional to
   battalions × `org_unit_types` regardless of brigade count (36 and 39 with 3 battalions).
   Each row is keyed to one battalion so nothing is *mixed*, but the views are not empty
   and are not brigade-filtered.
4. **All four views bypass RLS** once it exists, because none declares
   `security_invoker = true`. Migration `032` must land before `033` for this reason.

---

## The migration series is portable to vanilla Postgres — one exception

Verified by running all 27 migrations against a fresh local PostgreSQL 17.6 database. **All
27 applied. Exactly one shim was required:**

- **`004_users.sql`** ends with `INSERT INTO users (...) SELECT ... FROM auth.users`.
  `auth.users` is Supabase's own table and 004 is immutable, so a local database needs an
  empty stand-in. `scripts/setup-test-db.ts` creates one with just the columns 004 selects.
  Empty is correct: the backfill exists to adopt pre-existing Supabase auth accounts, and a
  fresh database has none.

Nothing else surfaced — no other Supabase-specific SQL, no extensions, no roles, no
`storage.*`. That makes a **local development stack feasible**, which was not previously
known: apart from Auth and Storage (which the app reaches over HTTPS, not SQL), the schema
does not depend on Supabase.

## Test databases are local, and enforced at runtime

The database-backed suites open a transaction and issue `DELETE FROM brigades` and
`DELETE FROM battalions` to reach a known state. They previously resolved their connection
from `DIRECT_URL || DATABASE_URL` — the live application database — and destroyed a row
created through the UI.

They now read **`TEST_DATABASE_URL` only** and skip when it is unset. Two guards:

| Guard | Catches |
| --- | --- |
| `tests/helpers/test-db.ts` (runtime) | A resolved connection to any non-loopback host, or any database not named `kshironet_test`. **Throws**, never skips — a silent skip would look like "no database configured". This is the one that holds if someone points `TEST_DATABASE_URL` at a second Supabase project. |
| `tests/helpers/test-db-isolation.test.ts` (source text) | `process.env.DATABASE_URL` / `DIRECT_URL` reappearing under `tests/` by copy-paste, and any `new Client(` that does not go through the helper. |

Setup: `npm run test:db:setup` (add `--reset` to drop and recreate).

### Suites that only mean something against populated data

A suite that turns from real-green to empty-green is worse than a missing one, because the
run still reports every file passing. Two had this property:

- **`tests/db/status-parity.test.ts`** — the only suite that reads ambient data rather than
  creating fixtures. Its four tests had `if (roles.length === 0) return;` guards and passed
  trivially on an empty database. They now **skip with a printed reason**, so the run reports
  skipped rather than passed. `npm run import:force-structure` against the test database
  restores real coverage.
- **`tests/admin/battalion-brigade-scope.test.ts`** — subtler. Its "refuses to guess" test
  inserted a single brigade named `__test__ second`, which only produced the ambiguity it
  asserts because the live database already held one. On a clean database the migration
  adopted as designed and the test failed. It now creates both brigades itself.

The other three database-backed suites create all their own fixtures and were unaffected.

## The checklist before `multi_brigade_isolation_ready` is set to `'1'`

Migration `034` performs the flip as its own clearly-marked statement. It must not be run
until every one of these is true and verified:

1. `brigade_id` present and `NOT NULL` on every tenant-scoped table.
2. Composite foreign keys in place — `FOREIGN KEY (parent_id, brigade_id)` — so a child row
   cannot reference a parent in another brigade. FK enforcement bypasses RLS, so policies
   alone cannot prevent this.
3. The application connects as a database role that is **not** the table owner and does
   **not** have `BYPASSRLS`. As of now it connects as `postgres`, which has
   `rolbypassrls = true`, so every policy would be silently ignored.
4. RLS enabled and forced on every tenant-scoped table, with `SELECT`/`INSERT`/`UPDATE`/
   `DELETE` policies that fail closed when `app.brigade_id` is unset.
5. `security_invoker = true` on all four views, and the cross-brigade `CROSS JOIN` in
   `v_certification_gaps` and the personal-number join in `v_role_status` corrected.
6. The cross-brigade isolation tests passing, including the negative assertions that
   brigade A's context sees zero of brigade B's rows and that an unset context sees nothing.

Flipping the flag with any of these unmet re-enables silent data merging. The migration
completing proves the DDL applied; it does not prove isolation is correct.

---

## Migration map

| # | File | Status |
| --- | --- | --- |
| 025 | `brigades.sql` | Shipped — `brigades`, the settings key, and the (now removed) single-brigade trigger |
| 026 | `battalion_brigade_scope.sql` | Shipped — `brigade_id` on `battalions`, `UNIQUE (brigade_id, code)`, composite anchor |
| 027 | `unscoped_entity_guard.sql` | Shipped — drops 025's trigger, adds the six-table creation block |
| 028 | `brigades_foundation.sql` | Planned — GUC helpers, adopt helper, app role grants |
| 029 | `brigade_columns.sql` | Planned — `brigade_id` on the remaining 37 tables |
| 030 | `brigade_referential_integrity.sql` | Planned — composite FKs, remaining re-scoped keys |
| 031 | `users_brigade_and_roles.sql` | Planned — `brigade_id`, `active_brigade_id`, `brigade_admin` |
| 032 | `views_security_invoker.sql` | Planned — **must precede 033** |
| 033 | `rls_policies.sql` | Planned |
| 034 | `rls_enable.sql` | Planned — ENABLE + FORCE + assertions, then the flag flip |
