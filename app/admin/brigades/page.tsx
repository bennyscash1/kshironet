import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/config/app";
import { getCurrentUser } from "@/lib/auth/user";
import { canManageBrigades } from "@/lib/auth/permissions";
import { listBrigades } from "@/lib/db/repositories/brigades";
import { isMultiBrigadeIsolationReady } from "@/lib/db/repositories/system-settings";
import { BrigadesManager } from "@/components/admin/brigades-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("ניהול חטיבות"),
};

export default async function BrigadesPage() {
  // Second, independent server-side gate. app/admin/layout.tsx already calls
  // requireGlobalSection(), and the proxy already restricts /admin — this check relies on
  // neither, because a hidden tab must not be reachable by typing its URL.
  const me = await getCurrentUser();
  if (!canManageBrigades(me)) redirect("/");

  const [brigades, isolationReady] = await Promise.all([
    listBrigades(),
    isMultiBrigadeIsolationReady(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ניהול חטיבות</h1>
      <BrigadesManager brigades={brigades} isolationReady={isolationReady} />
    </div>
  );
}
