/**
 * The system's name, slogan and brand mark, in one place.
 *
 * Every header, page title and brand spot reads from here, so a rename is a one-line change
 * instead of a grep across a dozen files — which is exactly how the previous name ended up
 * in seven `metadata.title` strings, two components and a mockup.
 *
 * NOT the place for infrastructure identifiers. The Supabase project ref, the Vercel
 * project, env var names, database tables and the migration files all keep their existing
 * names: renaming those buys nothing and breaks deploys.
 */

/** The Hebrew display name — what users see. */
export const APP_NAME = "כשירונט";

/**
 * The English identifier, for code, docs and package metadata. Never rendered to users.
 * The npm-safe form is `kshironet` (see package.json `name`, which must be lowercase
 * kebab-case); this capitalized form is for prose and comments.
 */
export const APP_NAME_EN = "Kshironet";

/** The tagline, shown under the brand mark. */
export const APP_SLOGAN = "כשירות בזמן אמת";

/**
 * The owning formation. KEPT in the top-nav brand line, and worth saying why: the system
 * serves one brigade's battalions, and every PDF/Excel export header carries the 228 mark.
 * It is deliberately NOT repeated on the auth screens, where the logo plus the slogan is
 * the whole identity and a unit number would just crowd it.
 */
export const BRIGADE_LABEL = "228";

/** The full brand line: "כשירונט · 228". Used by the top nav. */
export const APP_NAME_WITH_BRIGADE = `${APP_NAME} · ${BRIGADE_LABEL}`;

/**
 * The brand mark.
 *
 * `/logo.png` is derived from the supplied `/logo.jpeg` (which is kept as the original):
 * the JPEG has a flat light-grey background that would render as a visible box on the white
 * header and auth card, so the background was flood-filled to transparent from the edges
 * inward. Regenerate with scripts/make-logo.mjs if the source artwork changes.
 *
 * The dimensions are the artwork's true pixel size. Next/Image needs them to reserve
 * layout space; every use pairs a height class with `w-auto` so the ratio is preserved at
 * any breakpoint.
 */
export const APP_LOGO = {
  src: "/logo.png",
  width: 492,
  height: 466,
  /** The mark already contains the wordmark, so the alt text is the name itself. */
  alt: `לוגו ${APP_NAME}`,
} as const;

/**
 * A browser-tab title for one screen: `pageTitle("התחברות")` → "התחברות · כשירונט".
 *
 * The separator is a middot with spaces, matching what the header uses. Called with no
 * argument it returns the bare brand line, so the root layout and a leaf route cannot
 * drift apart in formatting.
 */
export function pageTitle(screen?: string): string {
  return screen ? `${screen} · ${APP_NAME}` : APP_NAME_WITH_BRIGADE;
}
