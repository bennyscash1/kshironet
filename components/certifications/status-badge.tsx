import { Badge } from "@/components/ui/badge";
import {
  CERTIFICATION_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  ROSTER_STATUS_LABELS,
  type CertificationStatus,
  type RequestStatus,
  type RosterStatus,
} from "@/lib/types";

const CERT_VARIANT: Record<CertificationStatus, string> = {
  draft: "bg-slate-500 text-white",
  open: "bg-emerald-500 text-white",
  full: "bg-amber-500 text-white",
  closed: "bg-slate-600 text-white",
  in_progress: "bg-blue-500 text-white",
  completed: "bg-teal-600 text-white",
  cancelled: "bg-rose-600 text-white",
};

export function CertificationStatusBadge({ status }: { status: CertificationStatus }) {
  return (
    <Badge className={`${CERT_VARIANT[status]} font-semibold border-0 shadow-sm`}>
      {CERTIFICATION_STATUS_LABELS[status]}
    </Badge>
  );
}

const ROSTER_VARIANT: Record<RosterStatus, string> = {
  registered: "bg-slate-500 text-white",
  pending_approval: "bg-amber-500 text-white",
  approved: "bg-emerald-500 text-white",
  rejected: "bg-rose-600 text-white",
  participated: "bg-blue-500 text-white",
  did_not_participate: "bg-rose-500 text-white",
  did_not_report: "bg-orange-600 text-white",
  passed: "bg-teal-600 text-white",
  failed: "bg-rose-600 text-white",
};

export function RosterStatusBadge({ status }: { status: RosterStatus }) {
  return (
    <Badge className={`${ROSTER_VARIANT[status]} font-semibold border-0 shadow-sm`}>
      {ROSTER_STATUS_LABELS[status]}
    </Badge>
  );
}

const REQUEST_VARIANT: Record<RequestStatus, string> = {
  opened: "bg-slate-500 text-white",
  in_review: "bg-amber-500 text-white",
  approved: "bg-emerald-500 text-white",
  rejected: "bg-rose-600 text-white",
  certification_opened: "bg-blue-500 text-white",
  closed: "bg-slate-600 text-white",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge className={`${REQUEST_VARIANT[status]} font-semibold border-0 shadow-sm`}>
      {REQUEST_STATUS_LABELS[status]}
    </Badge>
  );
}
