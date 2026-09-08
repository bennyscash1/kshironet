import type { Metadata } from "next";
import { pageTitle } from "@/lib/config/app";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";
import { canManageUsers } from "@/lib/auth/permissions";
import { listAllUsers, listPendingUsers } from "@/lib/db/repositories/users";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { UsersManager } from "@/components/admin/users-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("ניהול הרשאות"),
};

export default async function PermissionsPage() {
  const me = await getCurrentUser();
  if (!canManageUsers(me)) redirect("/");

  const [pending, all, battalions] = await Promise.all([
    listPendingUsers(),
    listAllUsers(),
    listBattalions(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ניהול הרשאות משתמשים</h1>
      <UsersManager
        pending={pending}
        all={all}
        battalions={battalions.filter((b) => b.is_active === 1)}
        currentUserId={me!.id}
      />
    </div>
  );
}
