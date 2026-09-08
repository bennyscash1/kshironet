"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BattalionRequest, CertificationWithCounts } from "@/lib/types";

export function RequestActionsPanel({
  request,
  openCertifications,
}: {
  request: BattalionRequest;
  openCertifications: CertificationWithCounts[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [certName, setCertName] = useState(request.requested_cert_type);
  const [startDate, setStartDate] = useState(request.desired_date ?? "");
  const [slots, setSlots] = useState(request.quantity_needed);
  const [linkTarget, setLinkTarget] = useState<number | undefined>(openCertifications[0]?.id);

  async function changeStatus(status: string) {
    setSubmitting(true);
    const res = await fetch(`/api/requests/${request.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("הפעולה נכשלה");
      return;
    }
    toast.success("הסטטוס עודכן");
    router.refresh();
  }

  async function openCertification() {
    if (!startDate) {
      toast.error("יש לבחור תאריך התחלה");
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/requests/${request.id}/open-certification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: certName,
        start_date: startDate,
        total_slots: slots,
        registration_open: true,
        status: "open",
        prerequisites: [],
        quotas: [],
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("פתיחת ההסמכה נכשלה");
      return;
    }
    toast.success("נפתחה הסמכה חדשה");
    router.refresh();
  }

  async function linkCertification() {
    if (!linkTarget) return;
    setSubmitting(true);
    const res = await fetch(`/api/requests/${request.id}/link-certification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificationId: linkTarget }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("השיוך נכשל");
      return;
    }
    toast.success("הדרישה שויכה להסמכה קיימת");
    router.refresh();
  }

  const canAct = !["closed", "certification_opened"].includes(request.status);

  return (
    <div className="border rounded-md p-3 space-y-3">
      <h2 className="font-semibold text-sm">פעולות חטיבה</h2>
      {canAct && (
        <div className="flex flex-wrap gap-2">
          {request.status === "opened" && (
            <Button size="sm" variant="outline" disabled={submitting} onClick={() => changeStatus("in_review")}>
              העבר לטיפול
            </Button>
          )}
          {(request.status === "opened" || request.status === "in_review") && (
            <Button size="sm" variant="outline" disabled={submitting} onClick={() => changeStatus("rejected")}>
              דחה
            </Button>
          )}
          {request.status === "in_review" && (
            <Button size="sm" variant="outline" disabled={submitting} onClick={() => changeStatus("approved")}>
              אשר
            </Button>
          )}
          {request.status === "approved" && (
            <>
              <Button size="sm" onClick={() => setShowOpenForm((s) => !s)}>
                פתח הסמכה חדשה
              </Button>
              {openCertifications.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setShowLinkForm((s) => !s)}>
                  שייך להסמכה קיימת
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {showOpenForm && (
        <div className="border rounded-md p-3 space-y-3 bg-muted/30">
          <div className="space-y-1.5">
            <Label>שם ההסמכה</Label>
            <Input value={certName} onChange={(e) => setCertName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>תאריך התחלה</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>מספר מקומות</Label>
              <Input type="number" value={slots} onChange={(e) => setSlots(Number(e.target.value))} />
            </div>
          </div>
          <Button size="sm" disabled={submitting} onClick={openCertification}>
            אישור פתיחה
          </Button>
        </div>
      )}

      {showLinkForm && (
        <div className="border rounded-md p-3 space-y-3 bg-muted/30">
          <div className="space-y-1.5">
            <Label>בחר הסמכה קיימת</Label>
            <select
              className="border rounded-md h-9 px-2 w-full bg-background"
              value={linkTarget}
              onChange={(e) => setLinkTarget(Number(e.target.value))}
            >
              {openCertifications.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.start_date})
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" disabled={submitting} onClick={linkCertification}>
            שייך
          </Button>
        </div>
      )}

      {!canAct && <p className="text-sm text-muted-foreground">אין פעולות זמינות עבור סטטוס זה.</p>}
    </div>
  );
}
