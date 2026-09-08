import { notFound } from "next/navigation";
import { getCertificationById } from "@/lib/db/repositories/certifications";
import { listRosterForCertification } from "@/lib/db/repositories/roster";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { ROSTER_STATUS_LABELS } from "@/lib/types";
import { PrintButton } from "@/components/certifications/print-button";
import { DateRange } from "@/components/ui/date-range";

export const dynamic = "force-dynamic";

export default async function PrintRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cert = await getCertificationById(Number(id));
  if (!cert) notFound();
  const [roster, battalions] = await Promise.all([listRosterForCertification(cert.id), listBattalions()]);
  const battalionMap = new Map(battalions.map((b) => [b.id, b]));

  return (
    <div className="p-8 print:p-0">
      <PrintButton />
      <h1 className="text-xl font-bold">{cert.name}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        <DateRange start={cert.start_date} end={cert.end_date} /> · {cert.location ?? ""}
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-start">
            <th className="p-1 text-start">שם מלא</th>
            <th className="p-1 text-start">מספר אישי</th>
            <th className="p-1 text-start">גדוד</th>
            <th className="p-1 text-start">פלוגה</th>
            <th className="p-1 text-start">טלפון</th>
            <th className="p-1 text-start">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="p-1">{r.full_name}</td>
              <td className="p-1">{r.personal_number}</td>
              <td className="p-1">{battalionMap.get(r.battalion_id)?.name ?? "-"}</td>
              <td className="p-1">{r.company_platoon ?? "-"}</td>
              <td className="p-1">{r.phone ?? "-"}</td>
              <td className="p-1">{ROSTER_STATUS_LABELS[r.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
