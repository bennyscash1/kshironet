import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, Users, Layers } from "lucide-react";
import { pageTitle } from "@/lib/config/app";
import { getCurrentUser } from "@/lib/auth/user";
import { canSwitchActiveBrigade } from "@/lib/auth/permissions";
import { getBrigadeByPublicId } from "@/lib/db/repositories/brigades";
import { listAllBattalionsForBrigade } from "@/lib/db/repositories/battalions";
import { getActiveBrigade } from "@/lib/auth/active-brigade";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("חטיבה"),
};

/**
 * A brigade's landing page — where the brigade selector sends you.
 *
 * READ ONLY. It does not set the active brigade, and that is deliberate: Next.js prefetches
 * links in the viewport, so a page that switched brigade on GET would do so merely because
 * a link scrolled into view. POST /api/admin/active-brigade is the only writer, and the
 * selector calls it before navigating here.
 *
 * Because of that ordering the URL and the active brigade can disagree — someone can type
 * or bookmark this URL for a brigade they are not currently acting in. The page says so
 * rather than silently pretending, since every other screen still shows the active one.
 */
export default async function BrigadePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const me = await getCurrentUser();
  if (!canSwitchActiveBrigade(me)) redirect("/");

  const { publicId } = await params;
  const brigade = await getBrigadeByPublicId(publicId);
  if (!brigade) notFound();

  const [battalions, active] = await Promise.all([
    listAllBattalionsForBrigade(brigade.id),
    getActiveBrigade(),
  ]);
  const isActiveSelection = active?.brigade.id === brigade.id;
  const activeBattalions = battalions.filter((b) => b.is_active === 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Building2 className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">{brigade.name}</h1>
        <Badge
          className={
            brigade.is_active === 1 ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
          }
        >
          {brigade.is_active === 1 ? "פעילה" : "מושבתת"}
        </Badge>
      </div>

      {!isActiveSelection && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p className="font-semibold">זו אינה החטיבה הפעילה שלך כרגע</p>
          <p className="text-muted-foreground">
            הגעת לכתובת של חטיבה זו, אך שאר המסכים במערכת עדיין מציגים את החטיבה שנבחרה
            בורר החטיבות שבראש העמוד. כדי לעבור לחטיבה הזו לגמרי, יש לבחור אותה בבורר.
          </p>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Layers className="size-4" />
            גדודים פעילים
          </div>
          <p className="mt-1 text-2xl font-bold">{activeBattalions.length}</p>
          <p className="text-xs text-muted-foreground">
            מתוך {battalions.length} מוגדרים
          </p>
          <Link
            href={`/admin/battalions?brigade=${brigade.id}`}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            ניהול גדודי החטיבה
          </Link>
        </div>

        <div className="rounded-md border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" />
            הרשאות
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            שיוך משתמשים לחטיבה יתווסף יחד עם מודל התפקידים.
          </p>
          <Link
            href="/admin/permissions"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            ניהול הרשאות
          </Link>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">גדודים ({battalions.length})</h2>
        {battalions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            טרם הוגדרו גדודים בחטיבה זו. ניתן להוסיף גדודים במסך ניהול הגדודים.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {battalions.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-md border p-3">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ backgroundColor: b.color_hex }}
                />
                <span className="font-medium">{b.name}</span>
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {b.code}
                </span>
                {b.is_active !== 1 && (
                  <Badge className="bg-rose-500 text-white">מושבת</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
