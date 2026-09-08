import { requireBattalionContext } from "@/lib/auth/require-scope";

/** Battalion-only section. The battalion comes from the session here, once, so every
 * nested route inherits the guard and none of them can be pointed at another battalion
 * by editing a URL. */
export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  await requireBattalionContext();
  return <>{children}</>;
}
