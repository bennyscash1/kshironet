"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRange } from "@/components/ui/date-range";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TrainingWithCounts } from "@/lib/types";

function TrainingsTable({ trainings }: { trainings: TrainingWithCounts[] }) {
  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>שם ההדרכה</TableHead>
            <TableHead>תחום</TableHead>
            <TableHead>תאריך</TableHead>
            <TableHead>איש קשר</TableHead>
            <TableHead>כמות הלו״זים</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trainings.map((t) => (
            <TableRow key={t.id} className="cursor-pointer">
              <TableCell>
                <Link href={`/trainings/${t.id}`} className="hover:underline font-medium">
                  {t.name}
                </Link>
              </TableCell>
              <TableCell>{t.domain ?? "-"}</TableCell>
              <TableCell>
                <DateRange start={t.start_date} end={t.end_date} />
              </TableCell>
              <TableCell>
                {t.contact_name ? (
                  <span>
                    {t.contact_name}
                    {t.contact_phone ? (
                      <span className="text-muted-foreground"> · {t.contact_phone}</span>
                    ) : null}
                  </span>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>{t.unit_count || "-"}</TableCell>
            </TableRow>
          ))}
          {trainings.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                אין הדרכות להצגה
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function TrainingsListTabs({
  upcoming,
  past,
}: {
  upcoming: TrainingWithCounts[];
  past: TrainingWithCounts[];
}) {
  const [tab, setTab] = useState("upcoming");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="upcoming">הדרכות קרובות ({upcoming.length})</TabsTrigger>
        <TabsTrigger value="past">הדרכות עבר ({past.length})</TabsTrigger>
      </TabsList>
      {tab === "upcoming" && <TrainingsTable trainings={upcoming} />}
      {tab === "past" && <TrainingsTable trainings={past} />}
    </Tabs>
  );
}
