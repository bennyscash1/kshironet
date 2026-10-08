import { redirect } from "next/navigation";
import { isUnscopedEntityBlockActive } from "@/lib/db/repositories/system-settings";
import { UnscopedEntityNotice } from "@/components/brigades/unscoped-entity-notice";
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
  // Reachable by typing the URL even when the list page hides its button, so the
  // block is resolved here too: the notice replaces the form rather than letting it
  // submit into a 409.
  const createBlocked = await isUnscopedEntityBlockActive();
  const { name, domain } = await searchParams;
  const gapRows = await listGapRows();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">תבנית הסמכה חדשה</h1>
      {createBlocked && <UnscopedEntityNotice entity="certification_templates" />}
      {!createBlocked && (
        <TemplateForm gapRows={gapRows} defaultName={name} defaultDomain={domain} />
      )}
    </div>
  );
}
