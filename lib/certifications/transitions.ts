import type { CertificationStatus } from "@/lib/types";

/**
 * THE certification status transition map — one copy, consumed by the server and the client.
 *
 * It previously existed TWICE: once in lib/db/repositories/certifications.ts, which
 * enforces it, and once in components/certifications/status-changer.tsx, which decides
 * which buttons to render. The two happened to be byte-identical, so nothing had drifted
 * yet — but a map that decides what the UI OFFERS and a map that decides what the server
 * ACCEPTS have to be the same map, or the UI eventually offers a button that 400s.
 *
 * The contents below are the server copy verbatim. This was a de-duplication, not a
 * redefinition: no transition was added, removed or reordered.
 *
 * NOTE: `confirmCertificationCompletion` writes `status = 'completed'` directly and does
 * NOT consult this map — which is how nine `draft -> completed` rows exist in
 * `status_history` despite `draft` allowing only `open` and `cancelled` here. That is a
 * known, deliberately deferred inconsistency; do not "fix" it by routing that function
 * through here without checking which completions it would start rejecting.
 */
export const VALID_TRANSITIONS: Record<CertificationStatus, CertificationStatus[]> = {
  draft: ["open", "cancelled"],
  open: ["full", "closed", "in_progress", "cancelled"],
  full: ["open", "closed", "in_progress", "cancelled"],
  closed: ["open", "in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** The statuses reachable from `status`. Empty for terminal states. */
export function allowedTransitionsFrom(status: CertificationStatus): CertificationStatus[] {
  return VALID_TRANSITIONS[status] ?? [];
}

/**
 * "Open for registration" — the one transition that matters operationally, singled out so
 * the UI can promote it to a primary action instead of burying it among its siblings.
 *
 * Only 6 of 109 recorded draft creations were ever moved to `open`; the control was a
 * small outline button sitting next to an equally-weighted "cancel".
 */
export const OPEN_FOR_REGISTRATION: CertificationStatus = "open";
