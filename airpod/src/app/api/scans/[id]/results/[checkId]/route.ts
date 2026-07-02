import { NextResponse } from "next/server";
import { getScan, saveScan } from "@/lib/store";
import { applyResultPatch, isOverridableStatus } from "@/lib/overrides";
import type { OverridableStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COMMENT_LENGTH = 2000;

// 담당자 판정 오버라이드 + 코멘트. AI/폴백 판정(status/claude)은 그대로 두고 이 위에 얹는다.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const { id, checkId } = await params;

  let body: { overrideStatus?: OverridableStatus | null; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const hasOverride = body.overrideStatus !== undefined;
  const hasComment = typeof body.comment === "string" && body.comment.trim().length > 0;
  if (!hasOverride && !hasComment) {
    return NextResponse.json({ error: "overrideStatus 또는 comment 중 하나는 있어야 합니다." }, { status: 400 });
  }
  if (hasOverride && body.overrideStatus !== null && !isOverridableStatus(body.overrideStatus)) {
    return NextResponse.json({ error: "overrideStatus는 pass/fail/review 또는 null이어야 합니다." }, { status: 400 });
  }
  if (typeof body.comment === "string" && body.comment.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: "코멘트가 너무 깁니다." }, { status: 400 });
  }

  const scan = await getScan(id);
  if (!scan) return NextResponse.json({ error: "scan not found" }, { status: 404 });

  const updated = applyResultPatch(scan, checkId, {
    overrideStatus: hasOverride ? (body.overrideStatus ?? null) : undefined,
    comment: hasComment ? body.comment!.trim() : undefined,
  });
  if (!updated) return NextResponse.json({ error: "check not found" }, { status: 404 });

  await saveScan(scan);
  return NextResponse.json({ result: updated });
}
