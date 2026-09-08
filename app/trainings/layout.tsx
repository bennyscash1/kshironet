import { requireGlobalSection } from "@/lib/auth/require-scope";

/** Outside the four sections a battalion-scoped role may reach: block the whole subtree
 * server-side, so a hidden tab cannot be opened by typing its URL. Global roles are
 * unaffected and render exactly as before. */
export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  await requireGlobalSection();
  return <>{children}</>;
}
