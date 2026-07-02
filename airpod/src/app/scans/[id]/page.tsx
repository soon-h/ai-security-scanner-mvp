"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import type { ScanRecord, CheckResult, StageState, OverridableStatus } from "@/lib/types";
import { STATUS_LABEL_KO, effectiveStatus } from "@/lib/types";

const OVERRIDE_OPTIONS: OverridableStatus[] = ["pass", "fail", "review"];

export default function ScanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/scans/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    const data = await res.json();
    setScan(data.scan);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      load();
    }, 1500);
    return () => clearInterval(t);
  }, [load]);

  async function rescan() {
    if (!scan) return;
    setRescanning(true);
    setRescanError(null);
    try {
      // PAT는 저장하지 않으므로 재점검은 PAT 없이 진행된다 — private repo면 홈에서 PAT를 다시 입력해야 한다.
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl: scan.repoUrl, branch: scan.branch, candidatePath: scan.candidatePath }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        window.location.href = `/scans/${data.id}`;
        return;
      }
      setRescanError(data.error ?? "재점검을 시작할 수 없습니다.");
    } finally {
      setRescanning(false);
    }
  }

  if (notFound) return <div className="panel">스캔을 찾을 수 없습니다. <Link href="/">← 홈</Link></div>;
  if (!scan) return <div className="panel muted">불러오는 중…</div>;

  const fail = scan.results.filter((r) => effectiveStatus(r) === "fail");
  const others = scan.results.filter((r) => effectiveStatus(r) !== "fail");

  return (
    <>
      <div className="panel">
        <div className="row">
          <div className="grow">
            <h1>{shortRepo(scan.repoUrl)}@{scan.branch}</h1>
            <div className="muted small">
              scan {scan.id} · {scan.executor === "docker" ? "Docker" : "Stub(시뮬레이션)"} executor
              {scan.usedLocalImageFallback ? " · local image fallback 사용" : ""}
              {scan.commitSha ? ` · commit ${scan.commitSha.slice(0, 7)}` : ""}
              {scan.candidatePath ? ` · ${scan.candidatePath}` : ""}
            </div>
          </div>
          <button onClick={rescan} disabled={rescanning}>
            {rescanning ? "재점검 시작 중…" : "재점검"}
          </button>
          <Link href="/">← 홈</Link>
        </div>

        {rescanError && (
          <div className="notice warn" style={{ marginTop: 12 }}>{rescanError}</div>
        )}

        {scan.executor === "stub" && (
          <div className="notice warn" style={{ marginTop: 12 }}>
            Docker 미설치 환경이라 런타임 점검은 시뮬레이션(stub)으로 수행됐습니다. evidence source가 <code>stub</code>인 항목은 실제 컨테이너 점검이 아닙니다.
            Docker 설치 후 동일 파이프라인이 실제 executor로 실행됩니다.
          </div>
        )}

        <div className="stages" style={{ marginTop: 14 }}>
          {scan.stages.map((s) => (
            <StageChip key={s.id} stage={s} />
          ))}
        </div>
      </div>

      {scan.status === "completed" && (
        <div className="panel">
          <h2>점검 결과</h2>
          <ResultTable scanId={scan.id} title="취약 (fail)" rows={fail} highlight onMutated={load} />
          <ResultTable scanId={scan.id} title="그 외" rows={others} onMutated={load} />
        </div>
      )}

      {scan.status === "failed" && (
        <div className="panel">
          <div className="notice warn">파이프라인 실패: {scan.error}</div>
        </div>
      )}
    </>
  );
}

function StageChip({ stage }: { stage: StageState }) {
  return (
    <div className="stage" title={stage.detail ?? ""}>
      <span className={`dot ${stage.status}`} />
      <span>{stage.label}</span>
    </div>
  );
}

function ResultTable({
  scanId,
  title,
  rows,
  highlight,
  onMutated,
}: {
  scanId: string;
  title: string;
  rows: CheckResult[];
  highlight?: boolean;
  onMutated: () => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <h3 className="small muted" style={{ margin: "8px 0" }}>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>항목</th>
            <th>심각도</th>
            <th>상태</th>
            <th>evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ResultRow key={r.id} scanId={scanId} r={r} open={highlight} onMutated={onMutated} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultRow({
  scanId,
  r,
  open,
  onMutated,
}: {
  scanId: string;
  r: CheckResult;
  open?: boolean;
  onMutated: () => void;
}) {
  const [expanded, setExpanded] = useState(!!open);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const status = effectiveStatus(r);

  async function patch(body: { overrideStatus?: OverridableStatus | null; comment?: string }) {
    setSaving(true);
    try {
      await fetch(`/api/scans/${scanId}/results/${r.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      onMutated();
    } finally {
      setSaving(false);
    }
  }

  async function submitComment() {
    const text = draft.trim();
    if (!text) return;
    await patch({ comment: text });
    setDraft("");
  }

  return (
    <>
      <tr onClick={() => setExpanded((v) => !v)} style={{ cursor: "pointer" }}>
        <td className="small"><strong>{r.id}</strong></td>
        <td className="small">{r.title}</td>
        <td className={`small sev ${r.severity}`}>{r.severity}</td>
        <td>
          <span className={`badge ${status}`}>{STATUS_LABEL_KO[status]}</span>
          {r.override && <span className="small muted" style={{ marginLeft: 6 }}>(담당자 수정)</span>}
        </td>
        <td className="small muted">
          {r.evidence}
          <span className="small" style={{ marginLeft: 6, opacity: 0.6 }}>[{r.source}]</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5}>
            <div className="report">
              {r.claude ? (
                <>
                  <h4>Claude 분석 {r.claude.generatedBy === "stub" ? "(stub)" : ""}</h4>
                  <div className="kv">
                    <span className="k">원인</span><span>{r.claude.reason}</span>
                    <span className="k">조치방안</span><span>{r.claude.remediation}</span>
                  </div>
                  {r.claude.example && <pre>{r.claude.example}</pre>}
                </>
              ) : (
                <p className="muted small">자동 판정 대상이 아니라 AI 설명이 없습니다 (evidence: {r.evidence}).</p>
              )}

              <div className="override-row">
                <span className="small muted">담당자 판정:</span>
                {OVERRIDE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    className={`ov-btn ${status === opt ? `active ${opt}` : ""}`}
                    disabled={saving}
                    onClick={(e) => {
                      e.stopPropagation();
                      patch({ overrideStatus: opt });
                    }}
                  >
                    {STATUS_LABEL_KO[opt]}
                  </button>
                ))}
                {r.override && (
                  <button
                    className="ov-btn ghost"
                    disabled={saving}
                    onClick={(e) => {
                      e.stopPropagation();
                      patch({ overrideStatus: null });
                    }}
                  >
                    AI 판정으로 되돌리기
                  </button>
                )}
              </div>
              {r.override && (
                <p className="small muted">
                  AI/폴백 원 판정: {STATUS_LABEL_KO[r.status]} (수정: {new Date(r.override.updatedAt).toLocaleString("ko-KR")})
                </p>
              )}

              <div className="comments">
                <h4 className="small muted" style={{ margin: "0 0 4px" }}>코멘트</h4>
                {(r.comments ?? []).map((c) => (
                  <div key={c.id} className="comment-item">
                    <div className="small muted">{new Date(c.createdAt).toLocaleString("ko-KR")}</div>
                    <div className="small">{c.text}</div>
                  </div>
                ))}
                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
                  <textarea
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="코멘트 남기기…"
                  />
                  <button style={{ marginTop: 6 }} disabled={saving || !draft.trim()} onClick={submitComment}>
                    코멘트 추가
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function shortRepo(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\.git$/, "");
}
