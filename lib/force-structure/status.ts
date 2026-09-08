/**
 * Manning status for a post (spec §2.3), ported without reinterpretation.
 *
 * Mirrors the `v_role_status` view so the canvas and the KPI cards cannot disagree; the
 * test suite checks the two against each other.
 *
 * Two rules here look like bugs and are not:
 *
 *   1. "A / B" means EITHER certification satisfies the post. It is an alternation, not
 *      a pair of requirements.
 *
 *   2. Drone coverage is POSITION-INDEPENDENT. If anyone in the squad holds any drone
 *      model, the drone requirement is met for EVERY post in that squad. It describes a
 *      capability the squad must be able to field, not a qualification each soldier must
 *      personally hold. Do not "fix" this to role level — §2.3 is explicit.
 */

export type RoleStatus = "empty" | "pending" | "ok" | "red";

/** The generic drone tokens a requirement may use, as opposed to a specific model. */
const DRONE_REQUIREMENT_TOKENS = ["רחפן", "רחפנים"];

/** Splits an alternation into its alternatives. Handles "A / B" and "A/B" alike, both of
 * which occur in the production data. */
export function parseAlternatives(requirement: string): string[] {
  return requirement
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/** True when the requirement is the generic drone token rather than a named model. */
export function isDroneRequirement(requirement: string): boolean {
  return DRONE_REQUIREMENT_TOKENS.includes(requirement.trim());
}

/** True when any of the held certifications is a drone model. */
export function holdsAnyDrone(held: Iterable<string>, droneModels: ReadonlySet<string>): boolean {
  for (const cert of held) if (droneModels.has(cert)) return true;
  return false;
}

export interface RequirementContext {
  /** Certifications the occupying soldier holds. */
  held: ReadonlySet<string>;
  /** Whether ANYONE in this post's squad holds a drone model. */
  squadHasDrone: boolean;
}

/** Is one requirement satisfied? */
export function requirementMet(requirement: string, context: RequirementContext): boolean {
  const alternatives = parseAlternatives(requirement);
  if (alternatives.length === 0) return true;

  for (const alternative of alternatives) {
    if (isDroneRequirement(alternative)) {
      if (context.squadHasDrone) return true;
      continue;
    }
    if (context.held.has(alternative)) return true;
  }
  return false;
}

export interface RoleRequirements {
  req1: string | null;
  req2: string | null;
  req3: string | null;
}

/** The requirements of a post, blank cells removed. */
export function requirementsOf(role: RoleRequirements): string[] {
  return [role.req1, role.req2, role.req3]
    .map((req) => (req ?? "").trim())
    .filter((req) => req !== "");
}

/** Which requirements are NOT satisfied — drives the "חסר …" label on the card. */
export function missingRequirements(
  role: RoleRequirements,
  context: RequirementContext
): string[] {
  return requirementsOf(role).filter((req) => !requirementMet(req, context));
}

/**
 * The post's status.
 *
 * The four states are different KINDS of problem, which is why §2.4 forbids summing them:
 *
 *   empty   — nobody is posted here. Needs a person.
 *   pending — posted, but with no recorded identity, so what they hold is unknown. This is
 *             deliberately NOT `red`: treating unknown as missing would overstate the
 *             certification gap and send people on courses they may already have.
 *   red     — posted, identified, missing a required certification. Needs a course.
 *   ok      — posted and fully qualified.
 */
export function computeRoleStatus(
  role: RoleRequirements,
  isManned: boolean,
  context: RequirementContext & { pendingIdentity?: boolean }
): RoleStatus {
  if (!isManned) return "empty";
  if (context.pendingIdentity) return "pending";
  return missingRequirements(role, context).length === 0 ? "ok" : "red";
}

export interface CompanyKpis {
  /** Number of posts on the establishment. */
  establishment: number;
  /** Posts that are actually manned, from the source's "משובץ" flag. */
  mannedPosts: number;
  /**
   * The figure displayed as "מאויש": manned posts PLUS the 120% bank.
   *
   * DELIBERATE DEVIATION FROM SPEC §2.4 — align-to-workbook. The specification defines
   * manning over establishment posts only, which reads 3-14 lower than the number in every
   * battalion's own spreadsheet, because theirs folds in the 120% bank. Users compare this
   * screen against that spreadsheet, so the screen matches the spreadsheet. Do not
   * "correct" this back to the spec definition.
   */
  manned: number;
  /** Size of the 120% bank, kept visible so `manned` can be decomposed. */
  bank: number;
  /** Manned posts missing at least one required certification. */
  certificationGap: number;
  /** Unmanned posts. Note this is establishment − mannedPosts, NOT establishment − manned:
   * the bank is extra people, not filled posts, so it cannot close a manning gap. */
  manpowerGap: number;
  /** Posts manned by someone with no recorded identity, so their certifications are
   * unknown. Counted as manned but never as a certification gap. */
  pendingIdentity: number;
  /**
   * Readiness, as the workbooks compute it: manned POSTS over establishment.
   *
   * DELIBERATE DEVIATION FROM SPEC §2.4 — align-to-workbook. The spec formula is
   * `(manned − certification gap) / establishment`, which reads about twenty points lower.
   * The workbook formula is the one the battalions quote, so it is the one shown.
   */
  readinessPct: number;
}

/**
 * The company KPIs (§2.4), aligned to the source workbooks.
 *
 * `certificationGap` and `manpowerGap` are returned separately and deliberately never
 * added together: an empty post needs a person, a post marked red needs a course. There is
 * no combined "gaps" figure anywhere.
 */
export function computeCompanyKpis(statuses: RoleStatus[], bank = 0): CompanyKpis {
  const establishment = statuses.length;
  const manpowerGap = statuses.filter((s) => s === "empty").length;
  const certificationGap = statuses.filter((s) => s === "red").length;
  const pendingIdentity = statuses.filter((s) => s === "pending").length;
  const mannedPosts = establishment - manpowerGap;

  return {
    establishment,
    mannedPosts,
    manned: mannedPosts + bank,
    bank,
    certificationGap,
    manpowerGap,
    pendingIdentity,
    readinessPct: establishment === 0 ? 0 : Math.round((mannedPosts / establishment) * 100),
  };
}

/** Key identifying the squad a post belongs to. A squad is scoped to its department
 * within its company — two departments may both have a "כיתה א' מסתערת". */
export function squadKey(companyId: number, department: string, squad: string | null): string {
  return `${companyId}${department}${squad ?? ""}`;
}

/**
 * The set of squads that have drone coverage.
 *
 * Built once for a company and then consulted per post, which is what makes the coverage
 * squad-wide rather than personal.
 */
export function squadsWithDrone(
  roles: {
    companyId: number;
    department: string;
    squad: string | null;
    heldCertifications: readonly string[];
  }[],
  droneModels: ReadonlySet<string>
): Set<string> {
  const covered = new Set<string>();
  for (const role of roles) {
    if (holdsAnyDrone(role.heldCertifications, droneModels)) {
      covered.add(squadKey(role.companyId, role.department, role.squad));
    }
  }
  return covered;
}
