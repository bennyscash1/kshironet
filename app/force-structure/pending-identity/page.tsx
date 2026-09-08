import Link from "next/link";
import { requireBattalionContext } from "@/lib/auth/require-scope";
import { listPendingIdentity } from "@/lib/db/repositories/force-structure";

export const dynamic = "force-dynamic";

/**
 * The people whose identity is incomplete.
 *
 * A view, not a workflow: no row here mutates anything (§1.10.1). The personal numbers
 * have to come from the source workbooks or a clerk, and inventing one here — even as a
 * placeholder — would collide with every other placeholder and make the soldier lookup
 * return the wrong person.
 */
export default async function PendingIdentityPage() {
  const { battalion } = await requireBattalionContext();
  const rows = await listPendingIdentity(battalion.id);

  const missingName = rows.filter((r) => r.full_name === null);
  const missingPn = rows.filter((r) => r.full_name !== null);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link
          href="/force-structure"
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          ← חזרה לשניים לפנים
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: battalion.color_hex }}>
          ממתינים להשלמת זהות · {battalion.name}
        </h1>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          כל השורות כאן נספרות במצבה ובמניין המאויש — הן אינן מוסתרות ואינן מקטינות את
          המצבה.
        </p>
        <p>
          עם זאת, המספר האישי הוא מפתח הקישור להסמכות המוחזקות, לחיפוש החייל ולעדכון החוזר
          מהסמכה שהושלמה. ללא מספר אישי לא ניתן לשבץ את החייל להסמכה — החסימה נאכפת בשרת.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          אין חיילים הממתינים להשלמת זהות בגדוד זה.
        </p>
      )}

      {missingPn.length > 0 && (
        <Section title={`חסר מספר אישי (${missingPn.length})`}>
          {missingPn.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="px-3 py-2 border-b last:border-0 text-sm">
              <span className="font-medium">{r.full_name}</span>
              <span className="text-muted-foreground">
                {" · "}
                {r.company}
                {r.department ? ` · ${r.department}` : ""}
                {r.squad ? ` · ${r.squad}` : ""}
                {r.serial ? ` · תקן ${r.serial}` : ""}
                {r.role_name ? ` · ${r.role_name}` : ""}
                {r.kind === "bank" ? " · בנק 120%" : ""}
              </span>
            </li>
          ))}
        </Section>
      )}

      {missingName.length > 0 && (
        <Section title={`תקן מסומן כמאויש ללא חייל רשום (${missingName.length})`}>
          {missingName.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="px-3 py-2 border-b last:border-0 text-sm">
              <span className="text-muted-foreground">
                {r.company}
                {r.department ? ` · ${r.department}` : ""}
                {r.squad ? ` · ${r.squad}` : ""}
                {r.serial ? ` · תקן ${r.serial}` : ""}
                {r.role_name ? ` · ${r.role_name}` : ""}
              </span>
            </li>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-sm">{title}</h2>
      <ul className="rounded-md border divide-y-0">{children}</ul>
    </section>
  );
}
