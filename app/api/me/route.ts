import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";

/** Current authenticated app user (role + status), or null if signed out. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(null, { status: 401 });
  return NextResponse.json(user);
}
