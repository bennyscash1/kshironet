"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { CertificationTax } from "@/lib/types";

export function TaxList({ taxes, canManage }: { taxes: CertificationTax[]; canManage: boolean }) {
  const router = useRouter();

  async function toggle(tax: CertificationTax) {
    if (!canManage) return;
    const res = await fetch(`/api/taxes/${tax.id}/fulfilled`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_fulfilled: tax.is_fulfilled !== 1 }),
    });
    if (!res.ok) {
      toast.error("העדכון נכשל");
      return;
    }
    router.refresh();
  }

  if (taxes.length === 0) return <span>אין מיסים מוגדרים</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {taxes.map((tax) => (
        <Badge
          key={tax.id}
          onClick={() => toggle(tax)}
          className={
            tax.is_fulfilled
              ? "bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600"
              : "bg-rose-500 text-white cursor-pointer hover:bg-rose-600"
          }
        >
          {tax.role_name} {tax.is_fulfilled ? "✓ סגור" : "✕ לא סגור"}
        </Badge>
      ))}
    </div>
  );
}
