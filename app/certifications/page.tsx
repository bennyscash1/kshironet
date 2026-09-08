import Link from "next/link";
import { listCertifications } from "@/lib/db/repositories/certifications";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { CertificationsListTabs } from "@/components/certifications/certifications-list-tabs";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CertificationsPage() {
  const [certifications, me] = await Promise.all([listCertifications(), getCurrentUser()]);
  const canEditData = canEdit(me);

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

      <CertificationsListTabs upcoming={upcoming} past={past} />
    </div>
  );
}
