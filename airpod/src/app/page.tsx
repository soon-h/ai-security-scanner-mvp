"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { ScanRecord } from "@/lib/types";
import { STATUS_LABEL_KO } from "@/lib/types";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/vulnerables/web-dvwa");
  const [branch, setBranch] = useState("");
  const [pat, setPat] = useState("");
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

  async function start() {
    if (!repoUrl.trim()) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl, branch, pat: pat || undefined }),
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
          GitHub 레포 URL을 넣으면 Clone → Build → Sandbox → Ansible 점검 → AI 판정·설명까지 자동으로 한 바퀴 돕니다.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="grow">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              onKeyDown={(e) => e.key === "Enter" && start()}
            />
          </div>
          <button onClick={start} disabled={starting}>
            {starting ? "시작 중…" : "점검 시작"}
          </button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="branch (기본: main)"
            style={{ maxWidth: 200 }}
          />
          <input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
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
      </div>

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
                const fail = s.results.filter((r) => r.status === "fail").length;
                const pass = s.results.filter((r) => r.status === "pass").length;
                const skip = s.results.filter((r) => r.status === "skip").length;
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
