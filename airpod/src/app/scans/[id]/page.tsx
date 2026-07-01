"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import type { ScanRecord, CheckResult, StageState } from "@/lib/types";
import { STATUS_LABEL_KO } from "@/lib/types";

export default function ScanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [notFound, setNotFound] = useState(false);

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

  // 완료/실패면 폴링 중단
  useEffect(() => {
    if (scan && scan.status !== "running") {
      // no-op: interval은 상위 effect가 관리하지만, 완료 후엔 굳이 멈추지 않아도 가볍다
    }
  }, [scan]);

  if (notFound) return <div className="panel">스캔을 찾을 수 없습니다. <Link href="/">← 홈</Link></div>;
  if (!scan) return <div className="panel muted">불러오는 중…</div>;

  const fail = scan.results.filter((r) => r.status === "fail");
  const others = scan.results.filter((r) => r.status !== "fail");

  return (
    <>
      <div className="panel">
        <div className="row">
          <div className="grow">
            <h1>{shortRepo(scan.repoUrl)}</h1>
            <div className="muted small">
              scan {scan.id} · {scan.executor === "docker" ? "Docker" : "Stub(시뮬레이션)"} executor
              {scan.usedLocalImageFallback ? " · local image fallback 사용" : ""}
            </div>
          </div>
          <Link href="/">← 홈</Link>
        </div>

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
          <ResultTable title="취약 (fail)" rows={fail} highlight />
          <ResultTable title="그 외" rows={others} />
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

function ResultTable({ title, rows, highlight }: { title: string; rows: CheckResult[]; highlight?: boolean }) {
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
            <ResultRow key={r.id} r={r} open={highlight} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultRow({ r, open }: { r: CheckResult; open?: boolean }) {
  const [expanded, setExpanded] = useState(!!open);
  return (
    <>
      <tr onClick={() => setExpanded((v) => !v)} style={{ cursor: r.claude ? "pointer" : "default" }}>
        <td className="small"><strong>{r.id}</strong></td>
        <td className="small">{r.title}</td>
        <td className={`small sev ${r.severity}`}>{r.severity}</td>
        <td>
          <span className={`badge ${r.status}`}>{STATUS_LABEL_KO[r.status]}</span>
        </td>
        <td className="small muted">
          {r.evidence}
          <span className="small" style={{ marginLeft: 6, opacity: 0.6 }}>[{r.source}]</span>
        </td>
      </tr>
      {expanded && r.claude && (
        <tr>
          <td colSpan={5}>
            <div className="report">
              <h4>Claude 분석 {r.claude.generatedBy === "stub" ? "(stub)" : ""}</h4>
              <div className="kv">
                <span className="k">원인</span><span>{r.claude.reason}</span>
                <span className="k">조치방안</span><span>{r.claude.remediation}</span>
              </div>
              {r.claude.example && <pre>{r.claude.example}</pre>}
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
