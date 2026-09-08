import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/db/repositories/templates";
import { listGapRows } from "@/lib/db/repositories/certification-gaps";
import { TemplateForm } from "@/components/templates/template-form";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await getTemplate(Number(id));
  if (!template) notFound();
  const gapRows = await listGapRows();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">עריכת תבנית</h1>
      <TemplateForm template={template} gapRows={gapRows} />
    </div>
  );
}
