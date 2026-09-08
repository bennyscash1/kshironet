import Link from "next/link";
import { listTemplatesByName } from "@/lib/db/repositories/templates";
import { listCertifications } from "@/lib/db/repositories/certifications";
import { Button } from "@/components/ui/button";
import { CourseHeaderEditor } from "@/components/templates/course-header-editor";
import { Plus, Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={multiline ? "text-sm whitespace-pre-line" : "text-sm"}>{value}</p>
    </div>
  );
}

export default async function TemplateCoursePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: encodedName } = await params;
  const name = decodeURIComponent(encodedName);
  const variants = await listTemplatesByName(name);

  if (variants.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{name}</h1>
        <p className="text-muted-foreground">אין תבנית עדיין עבור מקצוע זה.</p>
        <Button asChild>
          <Link href={`/templates/new?name=${encodeURIComponent(name)}`}>
            <Plus className="size-4" />
            צור תבנית
          </Link>
        </Button>
      </div>
    );
  }

  const domain = variants[0].domain;
  const variantIds = new Set(variants.map((v) => v.id));
  const gapRowId = variants.find((v) => v.gap_row_id != null)?.gap_row_id ?? null;
  const recentCerts = (await listCertifications())
    .filter(
      (c) =>
        (c.template_id !== null && variantIds.has(c.template_id)) ||
        (gapRowId !== null && c.gap_row_id === gapRowId)
    )
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <CourseHeaderEditor urlName={name} initialName={name} initialDomain={domain} />
        <Button asChild>
          <Link
            href={`/templates/new?name=${encodeURIComponent(name)}&domain=${encodeURIComponent(
              domain ?? ""
            )}`}
          >
            <Plus className="size-4" />
            הוסף מיקום נוסף
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {variants.map((v) => (
          <div key={v.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{v.default_location ?? "ללא מיקום"}</span>
              <Button variant="ghost" size="icon" asChild>
                <Link href={`/templates/${v.id}/edit`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            </div>
            {v.checkin_details && <DetailRow label="התייצבות" value={v.checkin_details} />}
            {v.duration_text && <DetailRow label="אורך ההסמכה" value={v.duration_text} />}
            {v.default_slots != null && (
              <DetailRow label="מספר מקומות" value={String(v.default_slots)} />
            )}
            {v.trainee_ratio && <DetailRow label="יחס חניכה נדרש" value={v.trainee_ratio} />}
            {v.ammo_required && (
              <DetailRow label="תחמושת נדרשת" value={v.ammo_required} multiline />
            )}
            {v.requirements_text && (
              <DetailRow label="דרישות / הגבלות" value={v.requirements_text} multiline />
            )}
            {v.equipment_text && (
              <DetailRow label="ציוד נדרש" value={v.equipment_text} multiline />
            )}
            {v.contacts_text && (
              <DetailRow label="אנשי קשר" value={v.contacts_text} multiline />
            )}
            {v.default_notes && <DetailRow label="הערות" value={v.default_notes} multiline />}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-bold">הסמכות אחרונות שבוצעו</h2>
        {recentCerts.length === 0 && (
          <p className="text-muted-foreground text-sm">אין הסמכות מקושרות לתבנית זו עדיין.</p>
        )}
        {recentCerts.map((c) => (
          <Link
            key={c.id}
            href={`/certifications/${c.id}`}
            className="block rounded-md border p-2 hover:bg-muted/50"
          >
            <span className="font-medium">{c.location}</span> · {c.start_date}
            {c.end_date ? ` – ${c.end_date}` : ""} · {c.status}
          </Link>
        ))}
      </div>
    </div>
  );
}
