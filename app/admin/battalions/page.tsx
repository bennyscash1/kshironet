import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/config/app";
import { getCurrentUser } from "@/lib/auth/user";
import { canManageBattalions } from "@/lib/auth/permissions";
import { listBrigades } from "@/lib/db/repositories/brigades";
import { listAllBattalionsForBrigade } from "@/lib/db/repositories/battalions";
import { BattalionsManager } from "@/components/admin/battalions-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("ניהול גדודים"),
};

export default async function AdminBattalionsPage({
  searchParams,
}: {
  searchParams: Promise<{ brigade?: string }>;
}) {
  // Second, independent server-side gate. app/admin/layout.tsx already calls
  // requireGlobalSection() and the proxy already restricts /admin; this relies on neither,
  // because a hidden tab must not be reachable by typing its URL.
  const me = await getCurrentUser();
  if (!canManageBattalions(me)) redirect("/");

  const brigades = await listBrigades();
  const active = brigades.filter((b) => b.is_active === 1);

  // There is no tenant context yet, so the brigade is chosen explicitly and carried in the
  // URL. Validated against the active list rather than trusted: an id for a brigade that
  // does not exist or is deactivated falls back to the first active one instead of
  // querying for it.
  const { brigade } = await searchParams;
  const requested = Number(brigade);
  const selected =
    active.find((b) => b.id === requested) ?? active[0] ?? null;

  const battalions = selected ? await listAllBattalionsForBrigade(selected.id) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ניהול גדודים</h1>
      {selected === null ? (
        <p className="text-sm text-muted-foreground">
          טרם הוגדרה חטיבה פעילה. יש ליצור חטיבה במסך ניהול החטיבות לפני הוספת גדודים.
        </p>
      ) : (
        <BattalionsManager
          brigades={active}
          selectedBrigadeId={selected.id}
          battalions={battalions}
        />
      )}
    </div>
  );
}
