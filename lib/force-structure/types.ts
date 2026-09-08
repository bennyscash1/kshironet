export interface CompanyKpiRow {
  company_id: number;
  code: string;
  name: string;
  kind: "rifle" | "support";
  establishment: number;
  manned_posts: number;
  certification_gap: number;
  manpower_gap: number;
  pending_identity: number;
  bank_count: number;
}

export interface CanvasRoleRow {
  role_id: number;
  company_id: number;
  department: string;
  squad: string | null;
  serial: string;
  role_name: string;
  req1: string | null;
  req2: string | null;
  req3: string | null;
  status: "empty" | "pending" | "ok" | "red";
  is_manned: boolean;
  assignment_id: number | null;
  full_name: string | null;
  personal_number: string | null;
  held: string[];
}

export interface BankSoldierRow {
  id: number;
  company_id: number;
  department: string | null;
  full_name: string;
  personal_number: string | null;
  rank: string | null;
  note: string | null;
  pending_pn: number;
  held: string[];
}

export interface SoldierLookupRow {
  source: "assignment" | "bank";
  assignment_id: number | null;
  bank_id: number | null;
  full_name: string;
  personal_number: string;
  phone: string | null;
  frame: string;
  certs: string[];
}
