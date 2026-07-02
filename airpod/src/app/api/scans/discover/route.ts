import { NextResponse } from "next/server";
import { validateRepoUrl, validateBranch, validatePat, DEFAULT_BRANCH } from "@/lib/validate";
import { discoverCandidates } from "@/lib/pipeline/repo";
import { sanitize } from "@/lib/analysis/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 이미지 후보 발견 (spec story 7-8): 임시로 clone해 Dockerfile 후보 목록만 돌려준다.
// 실제 점검은 사용자가 여기서 고른 candidatePath를 실어 POST /api/scans를 다시 호출한다.
export async function POST(req: Request) {
  let body: { repoUrl?: string; branch?: string; pat?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const repoUrl = (body.repoUrl || "").trim();
  const repoUrlError = validateRepoUrl(repoUrl);
  if (repoUrlError) return NextResponse.json({ error: repoUrlError }, { status: 400 });

  const rawBranch = body.branch ?? "";
  const branchError = validateBranch(rawBranch);
  if (branchError) return NextResponse.json({ error: branchError }, { status: 400 });
  const branch = rawBranch.trim() || DEFAULT_BRANCH;

  const patError = validatePat(body.pat, repoUrl);
  if (patError) return NextResponse.json({ error: patError }, { status: 400 });

  try {
    const { candidates } = await discoverCandidates(repoUrl, branch, body.pat || undefined);
    return NextResponse.json({ candidates });
  } catch (err) {
    // clone 실패 메시지도 PAT 유출 방지를 위해 sanitize한다 (orchestrator.ts의 safeMsg와 동일 원칙).
    const message = sanitize((err as Error).message).text;
    return NextResponse.json({ error: `레포 분석 실패: ${message}` }, { status: 400 });
  }
}
