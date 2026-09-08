"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GanttView } from "@/components/calendar/gantt-view";
import { SlotStatusIndicator } from "@/components/certifications/slot-status-indicator";
import { ExportReportActions, EXPORT_REPORT_CONTENT_ID } from "@/components/reports/export-report-actions";
import { CERTIFICATION_STATUS_LABELS } from "@/lib/types";
import type { ExportCertification, ExportTraining } from "@/lib/db/repositories/export";
import type { CalendarItem } from "@/components/calendar/types";
import { appToday } from "@/lib/calendar/anchor";

function hebrewDate(iso: string) {
  return format(new Date(iso), "EEEE, d/M/yyyy", { locale: he });
}

function certKey(id: number) {
  return `certification-${id}`;
}

function trainKey(id: number) {
  return `training-${id}`;
}

export function ExportReportBody({
  certs,
  trainings,
  ganttItems,
  from,
  to,
}: {
  certs: ExportCertification[];
  trainings: ExportTraining[];
  ganttItems: CalendarItem[];
  from: string;
  to: string;
}) {
  const totalCount = certs.length + trainings.length;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set([...certs.map((c) => certKey(c.id)), ...trainings.map((t) => trainKey(t.id))])
  );

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedKeys(new Set([...certs.map((c) => certKey(c.id)), ...trainings.map((t) => trainKey(t.id))]));
  }

  function clearAll() {
    setSelectedKeys(new Set());
  }

  const selectedCerts = useMemo(
    () => certs.filter((c) => selectedKeys.has(certKey(c.id))),
    [certs, selectedKeys]
  );
  const selectedTrainings = useMemo(
    () => trainings.filter((t) => selectedKeys.has(trainKey(t.id))),
    [trainings, selectedKeys]
  );
  const selectedGanttItems = useMemo(
    () => ganttItems.filter((i) => selectedKeys.has(i.key)),
    [ganttItems, selectedKeys]
  );

  const registrationGaps = selectedCerts.filter(
    (c) => c.total_slots !== null && c.registered_count < c.total_slots && c.status !== "cancelled"
  );
  const taxGaps = selectedCerts.flatMap((c) =>
    c.taxes.filter((t) => !t.is_fulfilled).map((t) => ({ cert: c, tax: t }))
  );

  const byDay = useMemo(() => {
    const map = new Map<string, { certs: ExportCertification[]; trainings: ExportTraining[] }>();
    const bucket = (day: string) => {
      if (!map.has(day)) map.set(day, { certs: [], trainings: [] });
      return map.get(day)!;
    };
    for (const c of selectedCerts) bucket(c.start_date).certs.push(c);
    for (const t of selectedTrainings) bucket(t.start_date).trainings.push(t);
    return map;
  }, [selectedCerts, selectedTrainings]);
  const days = Array.from(byDay.keys()).sort();

  return (
    <>
      <div className="no-print rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-sm">
            בחירת פריטים לייצוא ({selectedKeys.size}/{totalCount})
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={selectAll}>
              בחר הכל
            </Button>
            <Button size="sm" variant="outline" onClick={clearAll}>
              נקה הכל
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 max-h-60 overflow-y-auto">
          {certs.map((cert) => (
            <label key={certKey(cert.id)} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={selectedKeys.has(certKey(cert.id))}
                onChange={() => toggle(certKey(cert.id))}
              />
              <span>
                {cert.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {hebrewDate(cert.start_date)}
                  {cert.location ? ` · ${cert.location}` : ""}
                </span>
              </span>
            </label>
          ))}
          {trainings.map((training) => (
            <label key={trainKey(training.id)} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={selectedKeys.has(trainKey(training.id))}
                onChange={() => toggle(trainKey(training.id))}
              />
              <span className="flex items-start gap-1">
                <GraduationCap className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-label="הדרכה" />
                <span>
                  {training.name}
                  <span className="text-muted-foreground">
                    {" "}
                    · {hebrewDate(training.start_date)}
                    {training.domain ? ` · ${training.domain}` : ""}
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <ExportReportActions certs={selectedCerts} trainings={selectedTrainings} from={from} to={to} />

      <div id={EXPORT_REPORT_CONTENT_ID} className="space-y-6 bg-background p-2">
        <div data-pdf-atomic className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo228.png" alt="חטיבה 228" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-bold">סיכום הסמכות והדרכות</h1>
            <p className="text-muted-foreground">
              {hebrewDate(from)} — {hebrewDate(to)}
            </p>
          </div>
        </div>

        {selectedGanttItems.length > 0 && (
          <div data-pdf-atomic className="space-y-2 break-inside-avoid">
            <h2 className="font-bold">תצוגת גאנט</h2>
            {/* An explicit range, so the gantt does not auto-scroll anywhere; `today` only
                tints the current week when it happens to fall inside the exported range. */}
            <GanttView
              items={selectedGanttItems}
              today={appToday()}
              rangeStart={new Date(from)}
              rangeEnd={new Date(to)}
            />
          </div>
        )}

        {(registrationGaps.length > 0 || taxGaps.length > 0) && (
          <div data-pdf-atomic className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
            <h2 className="font-bold text-amber-800">משימות פתוחות בטווח</h2>
            <ul className="space-y-1 text-sm">
              {registrationGaps.map((c) => (
                <li key={`gap-${c.id}`} className="text-amber-900">
                  ⚠ <strong>{c.name}</strong> ({hebrewDate(c.start_date)}) — רשומים {c.registered_count}{" "}
                  מתוך {c.total_slots}, עדיין חסרים שמות
                </li>
              ))}
              {taxGaps.map(({ cert, tax }, i) => (
                <li key={`tax-${i}`} className="text-rose-800">
                  ✕ <strong>{cert.name}</strong> ({hebrewDate(cert.start_date)}) — מיסים: {tax.role_name}{" "}
                  (לא סגור)
                </li>
              ))}
            </ul>
          </div>
        )}

        {days.length === 0 && (
          <p data-pdf-atomic className="text-muted-foreground">
            {totalCount === 0 ? "אין הסמכות או הדרכות בטווח התאריכים שנבחר." : "לא נבחרו פריטים לייצוא."}
          </p>
        )}

        {days.map((day, dayIndex) => (
          <div key={day} className="space-y-3 break-inside-avoid">
            <h2
              data-pdf-atomic
              data-pdf-group-start="true"
              data-pdf-force-new-page={dayIndex === 0 ? "true" : undefined}
              className="text-lg font-bold border-b-2 border-primary pb-1"
            >
              {hebrewDate(day)}
            </h2>
            {byDay.get(day)!.certs.map((cert) => (
              <div key={cert.id} data-pdf-atomic className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{cert.name}</span>
                    {cert.location && (
                      <span className="text-muted-foreground text-sm"> · {cert.location}</span>
                    )}
                    {cert.end_date && cert.end_date !== cert.start_date && (
                      <span className="text-muted-foreground text-sm">
                        {" "}
                        (עד {hebrewDate(cert.end_date)})
                      </span>
                    )}
                    <SlotStatusIndicator
                      totalSlots={cert.total_slots}
                      registeredCount={cert.registered_count}
                    />
                  </div>
                  <span className="text-xs rounded-full bg-muted px-2 py-0.5">
                    {CERTIFICATION_STATUS_LABELS[cert.status]}
                  </span>
                </div>

                {cert.prerequisites.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    דרישות קדם: {cert.prerequisites.join(", ")}
                  </p>
                )}

                <p className="text-sm">
                  סה״כ רשומים: {cert.registered_count}
                  {cert.total_slots !== null ? ` מתוך ${cert.total_slots}` : ""}
                </p>

                {cert.battalionGroups.length === 0 && (
                  <p className="text-sm text-amber-700">אין עדיין הקצאות או שמות רשומים.</p>
                )}

                {cert.battalionGroups.map((group) => (
                  <div
                    key={group.battalion_id}
                    className="ps-3 border-e-2"
                    style={{ borderInlineEndColor: group.battalion_color }}
                  >
                    <p className="font-semibold text-sm" style={{ color: group.battalion_color }}>
                      {group.battalion_name}
                      {group.quota !== null ? ` (${group.registered.length}/${group.quota})` : ""}
                      {group.quota !== null && group.registered.length < group.quota && (
                        <span className="text-amber-700 font-normal"> — עדיין אין שמות מלאים</span>
                      )}
                    </p>
                    {group.registered.length > 0 ? (
                      <ul className="text-sm list-disc ms-5">
                        {group.registered.map((s, i) => (
                          <li key={i}>
                            {s.full_name} {s.personal_number}
                            {s.phone ? ` · ${s.phone}` : ""}
                            {s.company_platoon ? ` · ${s.company_platoon}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-amber-700 ms-5">טרם נשלחו שמות</p>
                    )}
                  </div>
                ))}

                {cert.reserve.length > 0 && (
                  <div className="ps-3 border-e-2 border-amber-400">
                    <p className="font-semibold text-sm text-amber-700">עתודה ({cert.reserve.length})</p>
                    <ul className="text-sm list-disc ms-5">
                      {cert.reserve.map((s, i) => (
                        <li key={i}>
                          {s.full_name} {s.personal_number}
                          {s.phone ? ` · ${s.phone}` : ""}
                          {s.battalion_name ? ` · ${s.battalion_name}` : ""}
                          {s.company_platoon ? ` · ${s.company_platoon}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {cert.taxes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {cert.taxes.map((t, i) => (
                      <span
                        key={i}
                        className={`text-xs rounded-full px-2 py-0.5 ${
                          t.is_fulfilled ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {t.role_name} {t.is_fulfilled ? "✓ סגור" : "✕ לא סגור"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {byDay.get(day)!.trainings.map((training) => {
              const sessionsByBattalion = new Map<string, typeof training.sessions>();
              for (const s of training.sessions) {
                if (!sessionsByBattalion.has(s.battalion_name)) sessionsByBattalion.set(s.battalion_name, []);
                sessionsByBattalion.get(s.battalion_name)!.push(s);
              }
              return (
                <div
                  key={`training-${training.id}`}
                  data-pdf-atomic
                  className="rounded-md border p-3 space-y-2"
                  style={{ borderInlineStartWidth: 4, borderInlineStartColor: training.color }}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-label="הדרכה" />
                      <span className="font-bold">{training.name}</span>
                      {training.end_date && training.end_date !== training.start_date && (
                        <span className="text-muted-foreground text-sm">
                          {" "}
                          (עד {hebrewDate(training.end_date)})
                        </span>
                      )}
                    </div>
                    <span className="text-xs rounded-full bg-muted px-2 py-0.5">הדרכה</span>
                  </div>

                  {training.domain && (
                    <p className="text-xs text-muted-foreground">תחום: {training.domain}</p>
                  )}

                  {training.sessions.length === 0 && (
                    <p className="text-sm text-amber-700">טרם נקבעו מפגשים.</p>
                  )}

                  {Array.from(sessionsByBattalion.entries()).map(([battalionName, sessions]) => (
                    <div
                      key={battalionName}
                      className="ps-3 border-e-2"
                      style={{ borderInlineEndColor: sessions[0]?.battalion_color }}
                    >
                      <p className="font-semibold text-sm" style={{ color: sessions[0]?.battalion_color }}>
                        {battalionName}
                      </p>
                      <ul className="text-sm list-disc ms-5">
                        {sessions.map((s, i) => (
                          <li key={i}>
                            {hebrewDate(s.session_date)} · <span dir="ltr">{s.start_time}–{s.end_time}</span>
                            {s.location ? ` · ${s.location}` : ""}
                            {s.instructor_name ? ` · ${s.instructor_name}` : ""}
                            {s.instructor_phone ? ` · ${s.instructor_phone}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
