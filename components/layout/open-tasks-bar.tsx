import Link from "next/link";
import { CircleCheck, TriangleAlert, Users, Inbox, ClipboardCheck } from "lucide-react";
import {
  countPendingApprovals,
  countPendingRequests,
  listOpenUnlimitedRegistrations,
  listPendingCompletionConfirmations,
  listRegistrationGaps,
  listTaxGaps,
} from "@/lib/db/repositories/open-tasks";

export async function OpenTasksBar() {
  const [registrationGaps, taxGaps, openUnlimited, completionReminders, pendingRequests, pendingApprovals] =
    await Promise.all([
      listRegistrationGaps(),
      listTaxGaps(),
      listOpenUnlimitedRegistrations(),
      listPendingCompletionConfirmations(),
      countPendingRequests(),
      countPendingApprovals(),
    ]);

  const totalTasks =
    registrationGaps.length +
    taxGaps.length +
    openUnlimited.length +
    completionReminders.length +
    (pendingRequests > 0 ? 1 : 0) +
    (pendingApprovals > 0 ? 1 : 0);

  if (totalTasks === 0) {
    return (
      <div className="bg-emerald-50 border-b border-emerald-200">
        <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-2 text-sm text-emerald-700">
          <CircleCheck className="size-4 shrink-0" />
          <span>אין משימות פתוחות כרגע</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <span className="flex items-center gap-1 text-xs font-bold text-amber-800 shrink-0">
          <TriangleAlert className="size-4" />
          משימות פתוחות ({totalTasks}):
        </span>

        {registrationGaps.map((task) => (
          <Link
            key={`reg-${task.certification_id}`}
            href={`/certifications/${task.certification_id}`}
            className="shrink-0 rounded-full bg-orange-500 text-white text-xs font-medium px-3 py-1 hover:bg-orange-600 transition-colors"
          >
            {task.certification_name}: רשומים {task.registered_count} מתוך {task.total_slots}
          </Link>
        ))}

        {openUnlimited.map((task) => (
          <Link
            key={`open-${task.certification_id}`}
            href={`/certifications/${task.certification_id}`}
            className="shrink-0 rounded-full bg-sky-500 text-white text-xs font-medium px-3 py-1 hover:bg-sky-600 transition-colors"
          >
            {task.certification_name}: ההרשמה פתוחה ({task.registered_count} רשומים)
          </Link>
        ))}

        {completionReminders.map((task) => (
          <Link
            key={`completion-${task.certification_id}`}
            href={`/certifications/${task.certification_id}`}
            className="shrink-0 flex items-center gap-1 rounded-full bg-indigo-500 text-white text-xs font-medium px-3 py-1 hover:bg-indigo-600 transition-colors"
          >
            <ClipboardCheck className="size-3" />
            {task.certification_name}: ממתין לאישור סיום
          </Link>
        ))}

        {taxGaps.map((task) => (
          <Link
            key={`tax-${task.tax_id}`}
            href={`/certifications/${task.certification_id}`}
            className="shrink-0 rounded-full bg-rose-500 text-white text-xs font-medium px-3 py-1 hover:bg-rose-600 transition-colors"
          >
            {task.certification_name} - מיסים: {task.role_name} (לא סגור)
          </Link>
        ))}

        {pendingRequests > 0 && (
          <Link
            href="/requests"
            className="shrink-0 flex items-center gap-1 rounded-full bg-blue-500 text-white text-xs font-medium px-3 py-1 hover:bg-blue-600 transition-colors"
          >
            <Inbox className="size-3" />
            {pendingRequests} דרישות ממתינות לטיפול
          </Link>
        )}

        {pendingApprovals > 0 && (
          <Link
            href="/certifications"
            className="shrink-0 flex items-center gap-1 rounded-full bg-violet-500 text-white text-xs font-medium px-3 py-1 hover:bg-violet-600 transition-colors"
          >
            <Users className="size-3" />
            {pendingApprovals} חיילים ממתינים לאישור
          </Link>
        )}
      </div>
    </div>
  );
}
