import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/current-role";

export async function POST(request: Request) {
  const { role } = await request.json();
  if (role !== "brigade" && !String(role).startsWith("battalion:")) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }
  const res = NextResponse.json({ role });
  res.cookies.set(COOKIE_NAME, role, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
