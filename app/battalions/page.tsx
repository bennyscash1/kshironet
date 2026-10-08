import Link from "next/link";
import type { Battalion } from "@/lib/types";
import { redirect } from "next/navigation";
import {
  listBattalions,
  listActiveBattalionsForBrigade,
  getBattalionById,
} from "@/lib/db/repositories/battalions";
import { getCurrentUser } from "@/lib/auth/user";
import {
  canSwitchActiveBrigade,
  getScopedBattalionId,
  isBattalionScoped,
} from "@/lib/auth/permissions";
import { getActiveBrigade } from "@/lib/auth/active-brigade";

export const dynamic = "force-dynamic";

/**
 * The brigade's battalion index — and, for a battalion-scoped user, a doorway straight
 * into their own battalion.
 *
 * THE DECISION IS MADE FROM THE AUTHENTICATED ROW, NEVER THE COOKIE. `active_role` is the
 * view selector behind "תצוגה כ: גדוד 8207"; any client can set it. Keying the redirect on
 * it would trap a brigade user previewing a battalion on that battalion's page with no way
 * back to the index. `isBattalionScoped` / `getScopedBattalionId` both read the session
 * user's database row, so a brigade user reaches this index in every view state.
 *
 * IT REDIRECTS BEFORE RENDERING. A server-side `redirect()` here, rather than an effect in
 * a client component, is what keeps the scoped user from seeing a frame of the full grid —
 * six battalion names they are not entitled to — before being moved on.
 */
export default async function BattalionsPage() {
  const me = await getCurrentUser();

  if (isBattalionScoped(me)) {
    // Null when the admin has not assigned a battalion yet (the role is granted at
    // approval, the battalion is set separately) — and also when the user is not approved.
    const battalionId = getScopedBattalionId(me);
    // The code comes off the battalion record because that is what /battalions/[code] keys
    // on. Deriving a slug from the id would only work while the two happen to agree.
    const own = battalionId === null ? null : await getBattalionById(battalionId);

    if (own) redirect(`/battalions/${own.code}`);

    // No battalion to send them to. They must not fall through to the grid below: a
    // scoped user is never entitled to the list of every battalion, and an unassigned one
    // is no exception.
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">גדודים</h1>
        <div className="rounded-lg border bg-card p-6 text-center space-y-1">
          <p className="font-bold">טרם שויך גדוד למשתמש שלך</p>
          <p className="text-sm text-muted-foreground">
            השיוך לגדוד נעשה ידנית על ידי מנהל המערכת החטיבתי. פנה אליו כדי להשלים את ההרשאה.
          </p>
        </div>
      </div>
    );
  }

  // Brigade roles only from here down — every scoped user returned or was redirected
  // above.
  //
  // A super admin sees the ACTIVE brigade's battalions, filtered in SQL. With no brigade
  // selected they get an explicit empty state rather than every brigade's battalions
  // merged into one grid — that merge is the exact confusion the brigade selector exists
  // to remove, and it would look like data rather than like a missing selection.
  //
  // This filter is application-level and is NOT a security boundary. It is correct for a
  // super admin because a super admin is authorised across every brigade; it must not be
  // relied on for any other role before row level security lands.
  if (canSwitchActiveBrigade(me)) {
    const active = await getActiveBrigade();
    if (!active) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">גדודים</h1>
          <div className="rounded-lg border bg-card p-6 text-center space-y-1">
            <p className="font-bold">לא נבחרה חטיבה</p>
            <p className="text-sm text-muted-foreground">
              במערכת קיימת יותר מחטיבה אחת. יש לבחור חטיבה בבורר החטיבות שבראש העמוד כדי
              לראות את הגדודים שלה.
            </p>
          </div>
        </div>
      );
    }

    const scopedBattalions = await listActiveBattalionsForBrigade(active.brigade.id);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-bold">גדודים</h1>
          <span className="text-sm text-muted-foreground">{active.brigade.name}</span>
        </div>
        {scopedBattalions.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center space-y-1">
            <p className="font-bold">טרם הוגדרו גדודים בחטיבה זו</p>
            <p className="text-sm text-muted-foreground">
              ניתן להוסיף גדודים במסך ניהול הגדודים.
            </p>
          </div>
        ) : (
          <BattalionGrid battalions={scopedBattalions} />
        )}
      </div>
    );
  }

  const battalions = await listBattalions();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">גדודים</h1>
      <BattalionGrid battalions={battalions} />
    </div>
  );
}

/** One grid, so the scoped and unscoped branches cannot drift apart visually. */
function BattalionGrid({ battalions }: { battalions: Battalion[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {battalions.map((b) => (
        <Link
          key={b.id}
          href={`/battalions/${b.code}`}
          className="rounded-lg border-e-4 bg-card shadow-sm p-4 hover:shadow-md transition-shadow flex items-center gap-3"
          style={{ borderInlineEndColor: b.color_hex }}
        >
          <span
            className="size-8 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: b.color_hex }}
          />
          <span className="font-bold text-lg">{b.name}</span>
        </Link>
      ))}
    </div>
  );
}
