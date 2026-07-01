import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { ScanRecord } from "@/lib/types";
import { saveScan, listScans } from "@/lib/store";
import { initialStages, runPipeline } from "@/lib/pipeline/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 스캔 이력 목록
export async function GET() {
  const scans = await listScans();
  return NextResponse.json({ scans });
}

// 새 스캔 시작 → 파이프라인을 백그라운드로 실행하고 즉시 id 반환
export async function POST(req: Request) {
  let body: { repoUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const repoUrl = (body.repoUrl || "").trim();
  if (!repoUrl) {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const scan: ScanRecord = {
    id: randomUUID().slice(0, 8),
    repoUrl,
    createdAt: now,
    updatedAt: now,
    status: "running",
    executor: "stub",
    usedLocalImageFallback: false,
    stages: initialStages(),
    results: [],
  };
  await saveScan(scan);

  // fire-and-forget: 응답을 막지 않고 파이프라인을 진행한다. UI는 폴링으로 상태를 읽는다.
  void runPipeline(scan).catch(async (err) => {
    scan.status = "failed";
    scan.error = (err as Error).message;
    await saveScan(scan);
  });

  return NextResponse.json({ id: scan.id }, { status: 201 });
}
