"use client";

import { useEffect, useState } from "react";
import { Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  REGISTRATION_LOCKED_SHORT,
  formatLockMoment,
  formatRemainingUntilLock,
  remainingUntilLock,
  type RegistrationLockFields,
} from "@/lib/utils/registration-lock";

/**
 * How long a battalion still has to register, in DAYS AND WHOLE HOURS.
 *
 * ONE LOCK PER CERTIFICATION, so every battalion sees the same number — this is the
 * certification's deadline rendered from the battalion's point of view, not a per-battalion
 * deadline. (Migration 021 collapsed the per-allocation dates; 022 added the hour.)
 *
 * NO TICKING CLOCK. The smallest unit displayed is an hour, so a seconds timer would repaint
 * 3,600 times to change one digit. It recomputes once a minute, which is enough to roll the
 * hour over promptly and cheap enough to leave running on a page a user keeps open.
 *
 * HYDRATION. `serverNowMs` is the server's instant at render, and it seeds the state so the
 * first client render is byte-identical to the server's. The live clock only takes over from
 * the interval, after mount — reading `Date.now()` during render would produce a mismatch on
 * every load that straddles an hour boundary. Both pages using this are `force-dynamic`, so
 * the seed is always fresh and there is no need to re-read the clock on mount.
 */
export function RegistrationLockCountdown({
  lock,
  serverNowMs,
  className,
}: {
  lock: RegistrationLockFields;
  /** `Date.now()` from the server render. */
  serverNowMs: number;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(serverNowMs);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const remaining = remainingUntilLock(lock, new Date(nowMs));
  // No deadline at all — render nothing rather than an empty banner. The caller does not
  // have to duplicate the null check.
  if (!remaining) return null;

  const moment = formatLockMoment(lock);

  if (remaining.passed) {
    return (
      <p
        className={cn(
          "text-sm rounded-md border border-rose-200 bg-rose-50 p-2.5 text-rose-800",
          "inline-flex items-center gap-1.5",
          className
        )}
      >
        <Lock className="size-4 shrink-0" />
        <span>
          {REGISTRATION_LOCKED_SHORT}
          {moment ? ` — מועד הנעילה היה ${moment}` : ""}
        </span>
      </p>
    );
  }

  // Under a day left is the state worth interrupting someone over, so it gets the warning
  // palette; anything further out stays informational.
  const urgent = remaining.days === 0;

  return (
    <p
      className={cn(
        "text-sm rounded-md border p-2.5 inline-flex items-center gap-1.5",
        urgent
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-sky-200 bg-sky-50 text-sky-800",
        className
      )}
    >
      <Clock className="size-4 shrink-0" />
      <span>
        {formatRemainingUntilLock(remaining)}
        {moment ? ` (${moment})` : ""}
      </span>
    </p>
  );
}
