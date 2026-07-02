import type { CheckResult, ScanRecord } from "./types";
import { STATUS_LABEL_KO, effectiveStatus, summarize } from "./types";

// 공유용 자기완결 HTML 리포트 (spec: 서버 없이 파일만으로 열람 가능해야 함 — CSS 인라인, JS 없음,
// 펼치기/접기는 <details>/<summary> 네이티브 기능으로 처리).
//
// 보안: evidence·Claude 설명·코멘트·repoUrl 등은 스캔 대상 컨테이너·사용자 입력에서 온 신뢰할 수
// 없는 문자열이다(이 프로젝트는 "취약한 이미지"를 점검 대상으로 삼는다 — evidence 자체가 공격자
// 통제 입력일 수 있다). 이스케이프 없이 HTML에 꽂으면 리포트를 여는 사람에게 저장형 XSS가 된다.
// 그래서 모든 동적 문자열은 반드시 escapeHtml을 거친 뒤에만 템플릿에 들어간다.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
  :root {
    --bg:#0f1115; --panel:#171a21; --panel-2:#1e222b; --border:#2a2f3a; --text:#e6e8ec; --muted:#9aa3b2;
    --pass:#2ecc71; --fail:#ff5c5c; --review:#f0b429; --skip:#6b7280; --na:#8a5cf6;
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--text); font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Malgun Gothic", sans-serif; font-size:14px; }
  .container { max-width: 960px; margin: 0 auto; }
  .notice { padding:8px 12px; border-radius:8px; font-size:12px; background:rgba(91,140,255,.1); border:1px solid rgba(91,140,255,.3); color:#b9caff; margin-bottom:18px; }
  section.scan { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:18px; margin-bottom:18px; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:18px; margin:0 0 4px; }
  h3 { font-size:14px; margin: 16px 0 8px; }
  .muted { color:var(--muted); }
  .small { font-size:12px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th, td { text-align:left; padding:8px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:12px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; }
  .badge.pass { background:rgba(46,204,113,.15); color:var(--pass); }
  .badge.fail { background:rgba(255,92,92,.15); color:var(--fail); }
  .badge.review { background:rgba(240,180,41,.15); color:var(--review); }
  .badge.skip { background:rgba(107,114,128,.2); color:var(--skip); }
  .badge.not_automated { background:rgba(138,92,246,.15); color:var(--na); }
  details { margin-top: 4px; }
  summary { cursor:pointer; color:var(--muted); font-size:12px; }
  .report-block { background:var(--panel-2); border-radius:8px; padding:10px 12px; margin-top:6px; }
  .kv { display:grid; grid-template-columns:90px 1fr; gap:4px 10px; margin:6px 0; }
  .kv .k { color:var(--muted); }
  pre { background:#0b0d11; border:1px solid var(--border); border-radius:6px; padding:10px; overflow-x:auto; font-size:12px; margin:6px 0 0; white-space:pre-wrap; }
  .comment-item { border-top:1px solid var(--border); padding:6px 0; }
  .comment-item:first-child { border-top:none; }
`;

function renderResultRow(r: CheckResult): string {
  const status = effectiveStatus(r);
  const overrideNote = r.override
    ? `<p class="small muted">담당자 수정 · AI/폴백 원 판정: ${escapeHtml(STATUS_LABEL_KO[r.status])} (${escapeHtml(new Date(r.override.updatedAt).toLocaleString("ko-KR"))})</p>`
    : "";
  const claudeBlock = r.claude
    ? `<div class="report-block">
        <div class="small muted">Claude 분석 ${r.claude.generatedBy === "stub" ? "(stub)" : ""}</div>
        <div class="kv">
          <span class="k">현재상황</span><span>${escapeHtml(r.claude.situation)}</span>
          <span class="k">클로드 분석</span><span>${escapeHtml(r.claude.reason)}</span>
          ${r.claude.remediation ? `<span class="k">조치방안</span><span>${escapeHtml(r.claude.remediation)}</span>` : ""}
        </div>
        ${r.claude.example ? `<pre>${escapeHtml(r.claude.example)}</pre>` : ""}
      </div>`
    : `<p class="small muted">자동 판정 대상이 아니라 AI 설명이 없습니다.</p>`;
  const comments = (r.comments ?? [])
    .map(
      (c) =>
        `<div class="comment-item"><div class="small muted">${escapeHtml(new Date(c.createdAt).toLocaleString("ko-KR"))}</div><div class="small">${escapeHtml(c.text)}</div></div>`,
    )
    .join("");
  const commentsBlock = comments ? `<div class="report-block">${comments}</div>` : "";

  return `
    <tr>
      <td class="small"><strong>${escapeHtml(r.id)}</strong></td>
      <td class="small">${escapeHtml(r.title)}</td>
      <td class="small">${escapeHtml(r.severity)}</td>
      <td><span class="badge ${status}">${escapeHtml(STATUS_LABEL_KO[status])}</span></td>
      <td class="small muted">${escapeHtml(r.evidence)}</td>
    </tr>
    <tr>
      <td colspan="5">
        <details>
          <summary>상세 보기</summary>
          ${overrideNote}
          ${claudeBlock}
          ${commentsBlock}
        </details>
      </td>
    </tr>`;
}

function renderScanSection(scan: ScanRecord): string {
  const s = summarize(scan.results);
  const title = `${scan.repoUrl}@${scan.branch}`;
  const meta = [
    `scan ${scan.id}`,
    scan.executor === "docker" ? "Docker" : "Stub(시뮬레이션)",
    scan.commitSha ? `commit ${scan.commitSha.slice(0, 7)}` : null,
    scan.candidatePath ?? null,
    `완료: ${new Date(scan.updatedAt).toLocaleString("ko-KR")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const rows = scan.results.map(renderResultRow).join("");

  return `
  <section class="scan">
    <h2>${escapeHtml(title)}</h2>
    <p class="small muted">${escapeHtml(meta)}</p>
    <p class="small">
      <span class="badge fail">취약 ${s.fail}</span>
      <span class="badge pass">양호 ${s.pass}</span>
      <span class="badge review">검토 ${s.review}</span>
      <span class="badge skip">제외 ${s.skip}</span>
    </p>
    <table>
      <thead>
        <tr><th>ID</th><th>항목</th><th>심각도</th><th>상태</th><th>evidence</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

export function renderReportHtml(scans: ScanRecord[]): string {
  const generatedAt = new Date().toLocaleString("ko-KR");
  const sections = scans.map(renderScanSection).join("\n");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>AIRPOD 점검 리포트</title>
<style>${STYLE}</style>
</head>
<body>
  <div class="container">
    <h1>AIRPOD 점검 리포트</h1>
    <div class="notice">이 리포트는 AIRPOD가 생성한 스냅샷이며 실시간 데이터가 아닙니다 — 내보낸 시각: ${escapeHtml(generatedAt)}</div>
    ${sections}
  </div>
</body>
</html>`;
}
