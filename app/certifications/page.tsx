import Link from "next/link";
import { isUnscopedEntityBlockActive } from "@/lib/db/repositories/system-settings";
import { UnscopedEntityNotice } from "@/components/brigades/unscoped-entity-notice";
import { listCertifications } from "@/lib/db/repositories/certifications";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { CertificationsListTabs } from "@/components/certifications/certifications-list-tabs";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CertificationsPage() {
  const [certifications, me, createBlocked] = await Promise.all([
    listCertifications(),
    getCurrentUser(),
    isUnscopedEntityBlockActive(),
  ]);
  // `certifications` has no brigade_id yet, so creating one is refused by the database
  // while more than one active brigade exists. A disabled affordance with a stated
  // reason beats a form that submits into a 409.
  const canEditData = canEdit(me) && !createBlocked;

  // A certification is "past" once its date (end date, or start date if none) has passed.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = certifications.filter((c) => (c.end_date || c.start_date) >= today);
  const past = certifications.filter((c) => (c.end_date || c.start_date) < today);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">הסמכות</h1>
        {canEditData && (
          <Button asChild>
            <Link href="/certifications/new">
              <Plus className="size-4" />
              הסמכה חדשה
            </Link>
          </Button>
        )}
      </div>

      {createBlocked && canEdit(me) && <UnscopedEntityNotice entity="certifications" />}

      <CertificationsListTabs upcoming={upcoming} past={past} />
    </div>
  );
}
