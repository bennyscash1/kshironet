"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRange } from "@/components/ui/date-range";
import { CertificationStatusBadge } from "@/components/certifications/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CertificationWithCounts } from "@/lib/types";

function CertificationsTable({ certifications }: { certifications: CertificationWithCounts[] }) {
  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>שם</TableHead>
            <TableHead>תחום</TableHead>
            <TableHead>תאריך</TableHead>
            <TableHead>מיקום</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead>רשומים</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {certifications.map((c) => (
            <TableRow key={c.id} className="cursor-pointer">
              <TableCell>
                <Link href={`/certifications/${c.id}`} className="hover:underline font-medium">
                  {c.name}
                </Link>
              </TableCell>
              <TableCell>{c.domain ?? "-"}</TableCell>
              <TableCell>
                <DateRange start={c.start_date} end={c.end_date} />
              </TableCell>
              <TableCell>{c.location ?? "-"}</TableCell>
              <TableCell>
                <CertificationStatusBadge status={c.status} />
              </TableCell>
              <TableCell>
                {c.registered_count}
                {c.slots_remaining !== null ? ` / ${c.total_slots}` : ""}
              </TableCell>
            </TableRow>
          ))}
          {certifications.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                אין הסמכות להצגה
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function CertificationsListTabs({
  upcoming,
  past,
}: {
  upcoming: CertificationWithCounts[];
  past: CertificationWithCounts[];
}) {
  const [tab, setTab] = useState("upcoming");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="upcoming">הסמכות קרובות ({upcoming.length})</TabsTrigger>
        <TabsTrigger value="past">הסמכות עבר ({past.length})</TabsTrigger>
      </TabsList>
      {tab === "upcoming" && <CertificationsTable certifications={upcoming} />}
      {tab === "past" && <CertificationsTable certifications={past} />}
    </Tabs>
  );
}
