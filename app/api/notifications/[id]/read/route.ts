import { NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/db/repositories/notifications";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await markNotificationRead(Number(id));
  return NextResponse.json({ ok: true });
}
