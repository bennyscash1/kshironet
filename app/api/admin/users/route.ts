import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/user";
import { listAllUsers, listPendingUsers } from "@/lib/db/repositories/users";

export async function GET(request: Request) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter");
  const users = filter === "pending" ? await listPendingUsers() : await listAllUsers();
  return NextResponse.json(users);
}
