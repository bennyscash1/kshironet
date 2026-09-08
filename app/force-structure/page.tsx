import { requireBattalionContext } from "@/lib/auth/require-scope";
import {
  listCompanyKpis,
  listCanvasRoles,
  listBankSoldiers,
  countPendingIdentity,
} from "@/lib/db/repositories/force-structure";
import { ForceStructureScreen } from "@/components/force-structure/force-structure-screen";

export const dynamic = "force-dynamic";

export default async function ForceStructurePage() {
  const { battalion, canEdit } = await requireBattalionContext();

  const [companies, roles, bank, pendingCount] = await Promise.all([
    listCompanyKpis(battalion.id),
    listCanvasRoles(battalion.id),
    listBankSoldiers(battalion.id),
    countPendingIdentity(battalion.id),
  ]);

  if (companies.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-3.5 h-7 rounded-full shrink-0" style={{ backgroundColor: battalion.color_hex }} />
          <h1 className="text-2xl font-bold" style={{ color: battalion.color_hex }}>
            שניים לפנים · {battalion.name}
          </h1>
        </div>
        <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
          טרם יובאה מצבה לגדוד זה. יש להריץ את הייבוא:
          <code className="mx-1 rounded bg-background px-1.5 py-0.5 text-xs">
            npm run import:force-structure -- --dry-run
          </code>
        </div>
      </div>
    );
  }

  return (
    <ForceStructureScreen
      battalion={battalion}
      companies={companies}
      roles={roles}
      bank={bank}
      pendingCount={pendingCount}
      canEdit={canEdit}
    />
  );
}
