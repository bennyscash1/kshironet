import { requireBattalionContext } from "@/lib/auth/require-scope";
import {
  listCertificationFamilies,
  listComputedGaps,
  listGapKeys,
  listUnitCounts,
  countClosedThisQuarter,
} from "@/lib/db/repositories/gaps";
import { listBattalionAllocations } from "@/lib/db/repositories/battalion-dashboard";
import { GapsScreen } from "@/components/gaps/gaps-screen";

export const dynamic = "force-dynamic";

export default async function GapsPage() {
  const { battalion, canEdit } = await requireBattalionContext();

  const [families, rows, keys, units, allocations, closedThisQuarter] = await Promise.all([
    listCertificationFamilies(),
    listComputedGaps(battalion.id),
    listGapKeys(battalion.id),
    listUnitCounts(battalion.id),
    listBattalionAllocations(battalion.id),
    countClosedThisQuarter(battalion.id),
  ]);

  return (
    <GapsScreen
      battalion={battalion}
      families={families}
      rows={rows}
      keys={keys}
      units={units}
      allocations={allocations}
      closedThisQuarter={closedThisQuarter}
      canEdit={canEdit}
    />
  );
}
