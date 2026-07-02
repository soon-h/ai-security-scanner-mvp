import { NextResponse } from "next/server";
import { getScan } from "@/lib/store";
import { renderReportHtml } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 선택한 스캔들을 자기완결 HTML 리포트로 내보낸다 (공유용 — 서버/네트워크 없이 파일만으로 열람 가능).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ error: "내보낼 스캔을 선택하세요 (ids 파라미터 필요)" }, { status: 400 });
  }

  const scans = (await Promise.all(ids.map((id) => getScan(id)))).filter((s) => s !== null);
  if (scans.length === 0) {
    return NextResponse.json({ error: "선택한 스캔을 찾을 수 없습니다" }, { status: 404 });
  }

  const html = renderReportHtml(scans);
  const filename = `airpod-report-${new Date().toISOString().replace(/[:.]/g, "-")}.html`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
