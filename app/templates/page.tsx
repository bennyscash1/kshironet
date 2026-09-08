import Link from "next/link";
import { listTemplates } from "@/lib/db/repositories/templates";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listTemplates();

  const groups = new Map<string, typeof templates>();
  for (const t of templates) {
    if (!groups.has(t.name)) groups.set(t.name, []);
    groups.get(t.name)!.push(t);
  }
  const courses = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "he"));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">בנק הסמכות (תבניות)</h1>
        <Button asChild>
          <Link href="/templates/new">
            <Plus className="size-4" />
            תבנית חדשה
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {courses.map(([name, variants]) => (
          <Link
            key={name}
            href={`/templates/course/${encodeURIComponent(name)}`}
            className="border rounded-md p-3 space-y-1 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{name}</span>
              {variants.length > 1 && (
                <span className="text-xs rounded-full bg-muted px-2 py-0.5">
                  {variants.length} מיקומים
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{variants[0].domain ?? "ללא תחום"}</p>
            <p className="text-sm text-muted-foreground">
              {variants.length === 1
                ? variants[0].default_location ?? ""
                : variants.map((v) => v.default_location).filter(Boolean).join(" · ")}
            </p>
          </Link>
        ))}
        {courses.length === 0 && (
          <p className="text-muted-foreground text-sm">אין תבניות עדיין.</p>
        )}
      </div>
    </div>
  );
}
