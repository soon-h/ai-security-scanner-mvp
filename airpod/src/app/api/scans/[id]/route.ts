import { NextResponse } from "next/server";
import { getScan } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ scan });
}
