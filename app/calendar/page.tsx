import { listCertifications, getCertificationBattalions } from "@/lib/db/repositories/certifications";
import { listTrainings, getTrainingBattalions } from "@/lib/db/repositories/trainings";
import {
  listInfluencingFactors,
  getInfluencingFactorBattalions,
} from "@/lib/db/repositories/influencing-factors";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { getBattalionScope } from "@/lib/auth/scope";
import { appTodayIso } from "@/lib/calendar/anchor";
import { CalendarClient } from "@/components/calendar/calendar-client";
import {
  certificationToCalendarItem,
  trainingToCalendarItem,
  influencingFactorToCalendarItem,
  type CalendarItem,
} from "@/components/calendar/types";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  // The calendar is a brigade-wide status view: EVERY role, the two battalion-scoped ones
  // included, sees every certification, training and influencing factor. Narrowing to a
  // single unit is what the optional unit filter in the toolbar is for. The scope below is
  // therefore used for links only — never to filter the data.
  const scope = await getBattalionScope();

  const [certifications, trainings, influencingFactors, battalions] = await Promise.all([
    listCertifications().then((rows) => rows.filter((c) => c.status !== "cancelled")),
    listTrainings(),
    listInfluencingFactors(),
    listBattalions(),
  ]);

  const certItems: CalendarItem[] = await Promise.all(
    certifications.map(async (c) =>
      certificationToCalendarItem({ ...c, battalions: await getCertificationBattalions(c.id) })
    )
  );

  const trainingItems: CalendarItem[] = await Promise.all(
    trainings.map(async (t) => trainingToCalendarItem(t, await getTrainingBattalions(t.id)))
  );

  const factorItems: CalendarItem[] = await Promise.all(
    influencingFactors.map(async (f) =>
      influencingFactorToCalendarItem(f, await getInfluencingFactorBattalions(f.id))
    )
  );

  // A scoped role cannot open /certifications/[id] (that section is not theirs), so their
  // certification bars point at the same certification seen through their own battalion,
  // under גדודים — where their allocation and their soldiers live.
  const items = [...certItems, ...trainingItems, ...factorItems].map((item) =>
    scope && item.kind === "certification"
      ? { ...item, href: `/battalions/${scope.code}/certifications/${item.id}` }
      : item
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">לוח שנה</h1>
      {/* Asia/Jerusalem's today, resolved here so the server's HTML and the client's first
          render anchor to the same week — a UTC host would otherwise resolve 00:15 Israel
          time to the previous day. */}
      <CalendarClient items={items} battalions={battalions} todayIso={appTodayIso()} />
    </div>
  );
}
