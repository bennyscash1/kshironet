import { NextResponse } from "next/server";
import { getGapRowSnapshot } from "@/lib/db/repositories/certification-gaps";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rowId: string }> }
) {
  const { rowId } = await params;
  return NextResponse.json(await getGapRowSnapshot(Number(rowId)));
}
