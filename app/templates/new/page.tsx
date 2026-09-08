import { redirect } from "next/navigation";
import { listGapRows } from "@/lib/db/repositories/certification-gaps";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { TemplateForm } from "@/components/templates/template-form";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; domain?: string }>;
}) {
  if (!canEdit(await getCurrentUser())) redirect("/templates");
  const { name, domain } = await searchParams;
  const gapRows = await listGapRows();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">תבנית הסמכה חדשה</h1>
      <TemplateForm gapRows={gapRows} defaultName={name} defaultDomain={domain} />
    </div>
  );
}
