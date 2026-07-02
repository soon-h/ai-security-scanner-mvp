"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { ScanRecord } from "@/lib/types";
import { STATUS_LABEL_KO, effectiveStatus } from "@/lib/types";

interface Candidate {
  path: string;
  baseImageGuess: string | null;
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/vulnerables/web-dvwa");
  const [branch, setBranch] = useState("");
  const [pat, setPat] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanRecord[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/scans");
    const data = await res.json();
    setScans(data.scans ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  // repo/branch/pat이 바뀌면 이전 후보 목록은 stale하므로 초기화한다.
  function resetDiscovery() {
    setCandidates(null);
    setSelectedPath(undefined);
    setError(null);
  }

  async function discover() {
    if (!repoUrl.trim()) return;
    setDiscovering(true);
    setError(null);
    try {
      const res = await fetch("/api/scans/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl, branch, pat: pat || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "레포를 분석할 수 없습니다.");
        setCandidates(null);
        return;
      }
      const found: Candidate[] = data.candidates ?? [];
      setCandidates(found);
      setSelectedPath(found[0]?.path);
    } finally {
      setDiscovering(false);
    }
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl, branch, pat: pat || undefined, candidatePath: selectedPath }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        window.location.href = `/scans/${data.id}`;
        return;
      }
      setError(data.error ?? "점검을 시작할 수 없습니다.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <div className="panel">
        <h1>컨테이너 보안 점검 시작</h1>
        <p className="muted small">
          GitHub 레포 URL을 넣고 레포를 분석하면 이미지 후보를 찾아줍니다. 후보를 고르면 Clone →
          Build → Sandbox → Ansible 점검 → AI 판정·설명까지 자동으로 한 바퀴 돕니다.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="grow">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                resetDiscovery();
              }}
              placeholder="https://github.com/owner/repo"
              onKeyDown={(e) => e.key === "Enter" && discover()}
            />
          </div>
          <button onClick={discover} disabled={discovering}>
            {discovering ? "분석 중…" : "레포 분석"}
          </button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            type="text"
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value);
              resetDiscovery();
            }}
            placeholder="branch (기본: main)"
            style={{ maxWidth: 200 }}
          />
          <input
            type="password"
            value={pat}
            onChange={(e) => {
              setPat(e.target.value);
              resetDiscovery();
            }}
            placeholder="GitHub PAT (private repo만 필요)"
            className="grow"
          />
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>
          PAT는 이 점검의 clone에만 임시로 사용되고 저장·기록되지 않습니다.
        </p>
        {error && (
          <div className="notice warn" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}

        {candidates !== null && (
          <div style={{ marginTop: 14 }}>
            {candidates.length === 0 ? (
              <>
                <div className="notice warn">Dockerfile을 찾지 못했습니다 — fallback 이미지로 점검을 진행합니다.</div>
                <button style={{ marginTop: 8 }} onClick={start} disabled={starting}>
                  {starting ? "시작 중…" : "점검 시작 (fallback)"}
                </button>
              </>
            ) : (
              <>
                <h3 className="small muted" style={{ margin: "8px 0" }}>이미지 후보</h3>
                {candidates.map((c) => (
                  <label key={c.path} className="row" style={{ marginTop: 4, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="candidate"
                      checked={selectedPath === c.path}
                      onChange={() => setSelectedPath(c.path)}
                    />
                    <span className="small">
                      <code>{c.path}</code>
                      {c.baseImageGuess && <span className="muted"> — base: {c.baseImageGuess}</span>}
                    </span>
                  </label>
                ))}
                <button style={{ marginTop: 10 }} onClick={start} disabled={starting || !selectedPath}>
                  {starting ? "시작 중…" : "점검 시작"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {scans.length > 0 && (
        <div className="panel">
          <h2>요약</h2>
          <SummaryCards scans={scans} />
        </div>
      )}

      <div className="panel">
        <h2>점검 이력</h2>
        {scans.length === 0 ? (
          <p className="muted small">아직 실행한 점검이 없습니다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>레포</th>
                <th>상태</th>
                <th>결과 요약</th>
                <th>실행 방식</th>
                <th>시각</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => {
                const fail = s.results.filter((r) => effectiveStatus(r) === "fail").length;
                const pass = s.results.filter((r) => effectiveStatus(r) === "pass").length;
                const skip = s.results.filter((r) => effectiveStatus(r) === "skip").length;
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/scans/${s.id}`}>{shortRepo(s.repoUrl)}</Link>
                      <div className="muted small">{s.id}</div>
                    </td>
                    <td>
                      <StatusChip status={s.status} />
                    </td>
                    <td className="small">
                      {s.status === "completed" ? (
                        <>
                          <span className="badge fail">취약 {fail}</span>{" "}
                          <span className="badge pass">양호 {pass}</span>{" "}
                          <span className="badge skip">제외 {skip}</span>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="small">
                      {s.executor === "docker" ? "Docker" : "Stub(시뮬레이션)"}
                      {s.usedLocalImageFallback ? " · fallback" : ""}
                    </td>
                    <td className="small muted">{new Date(s.createdAt).toLocaleString("ko-KR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="muted small">
        표시되는 평가 결과는 KISA가 직접 판정한 것이 아니라, 가이드 기반 점검 항목과 Ansible evidence로 시스템이 산출한 가이드 기반 점검 결과입니다.
        {" "}상태 표기: {Object.entries(STATUS_LABEL_KO).map(([k, v]) => `${k}=${v}`).join(", ")}
      </p>
    </>
  );
}

function shortRepo(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\.git$/, "");
}

// 이미지 수·Build 상태·점검 상태·취약점 통계 요약 카드 (spec story 33).
function SummaryCards({ scans }: { scans: ScanRecord[] }) {
  const totalImages = scans.length;
  const fallbackBuilds = scans.filter((s) => s.usedLocalImageFallback).length;
  const running = scans.filter((s) => s.status === "running").length;
  const completed = scans.filter((s) => s.status === "completed").length;
  const failedScans = scans.filter((s) => s.status === "failed").length;
  const totalFailChecks = scans.reduce((sum, s) => sum + s.results.filter((r) => effectiveStatus(r) === "fail").length, 0);

  return (
    <div className="summary">
      <div className="summary-card">
        <div className="num">{totalImages}</div>
        <div className="label">점검한 이미지</div>
      </div>
      <div className="summary-card">
        <div className="num">{totalImages - fallbackBuilds} / {fallbackBuilds}</div>
        <div className="label">정상 빌드 / fallback</div>
      </div>
      <div className="summary-card">
        <div className="num">{completed} · {running} · {failedScans}</div>
        <div className="label">완료 · 진행중 · 실패</div>
      </div>
      <div className="summary-card">
        <div className="num" style={{ color: "var(--fail)" }}>{totalFailChecks}</div>
        <div className="label">전체 취약 항목 수</div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: ScanRecord["status"] }) {
  const map: Record<ScanRecord["status"], string> = {
    running: "review",
    completed: "pass",
    failed: "fail",
  };
  const label: Record<ScanRecord["status"], string> = {
    running: "진행 중",
    completed: "완료",
    failed: "실패",
  };
  return <span className={`badge ${map[status]}`}>{label[status]}</span>;
}
