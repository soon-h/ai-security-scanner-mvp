import type { RawCheck } from "../types";
import type { RuntimeExecutor, RunHandle } from "../executor/types";
import { analyzeDockerfile, type DockerfileFacts } from "./dockerfile";

// Ansible evidence 수집 단계에 해당한다 (spec 신뢰 경계의 첫 단계).
// Dockerfile 정적 분석(D) + executor 기반 런타임 점검(R)으로 원시 evidence를 만든다.
// 룰 평가(rules.ts)는 이 evidence만 보고 status를 산출한다.

// 관리·DB 등 노출되면 위험한 포트 (C-03)
const SENSITIVE_PORTS: Record<number, string> = {
  22: "SSH", 23: "Telnet", 3306: "MySQL", 5432: "PostgreSQL", 6379: "Redis",
  27017: "MongoDB", 1433: "MSSQL", 9200: "Elasticsearch", 5984: "CouchDB", 11211: "Memcached",
};

// 일반적으로 기대되는 setuid/setgid 바이너리 (C-06 baseline). 이 외는 "예상 외"로 본다.
const EXPECTED_SUID = [
  "su", "sudo", "passwd", "chsh", "chfn", "newgrp", "gpasswd", "mount", "umount",
  "ping", "ping6", "unix_chkpwd", "pkexec", "chage", "expiry",
];

export async function collectEvidence(
  dockerfileContent: string | null,
  executor: RuntimeExecutor,
  handle: RunHandle | null,
): Promise<RawCheck[]> {
  const facts = analyzeDockerfile(dockerfileContent);
  const checks: RawCheck[] = [];

  // 카탈로그 순서대로 evidence 수집
  checks.push(await evidenceC01(facts, executor, handle));
  checks.push(evidenceC02(facts));
  checks.push(await evidenceC03(facts, executor, handle));
  checks.push(evidenceC04(facts));
  checks.push(await evidenceC05(executor, handle));
  checks.push(await evidenceC06(executor, handle));
  checks.push(await evidenceC07(executor, handle));
  checks.push(evidenceC08(facts));
  checks.push(evidenceC09(facts));
  // 계정/파일권한 축 (Slice 3)
  checks.push(await evidenceU04(executor, handle));
  checks.push(await evidenceU05(executor, handle));
  checks.push(await evidenceU16(executor, handle));
  checks.push(await evidenceFilePerm("U-18", "/etc/shadow", executor, handle));
  checks.push(await evidenceFilePerm("U-19", "/etc/hosts", executor, handle));
  checks.push(await evidenceFilePerm("U-22", "/etc/services", executor, handle));
  checks.push(await evidenceU25(executor, handle));

  return checks;
}

async function evidenceC01(
  facts: DockerfileFacts,
  executor: RuntimeExecutor,
  handle: RunHandle | null,
): Promise<RawCheck> {
  const userDirective = facts.present ? facts.lastUser : null;
  let runtimeUid: number | null = null;
  if (handle) {
    runtimeUid = await executor.inspectRuntimeUid(handle);
  }
  const parts: string[] = [];
  parts.push(`USER 지시어: ${userDirective ?? "(미지정 → 기본 root)"}`);
  parts.push(`실행 UID: ${runtimeUid === null ? "확인 불가" : runtimeUid}`);
  return {
    id: "C-01",
    source: runtimeUid !== null ? executor.source : "static",
    evidence: parts.join(" / "),
    data: { userDirective, runtimeUid },
  };
}

function evidenceC02(facts: DockerfileFacts): RawCheck {
  if (!facts.present) {
    return { id: "C-02", source: "static", evidence: "Dockerfile 없음 — 정적 시크릿 점검 대상 아님", data: { present: false } };
  }
  const hits = facts.secretHits;
  const evidence =
    hits.length > 0
      ? `민감 키에 하드코딩된 값 ${hits.length}건 (line ${hits.map((h) => h.line).join(", ")})`
      : "ENV/ARG에서 하드코딩 시크릿 패턴 미발견";
  return {
    id: "C-02",
    source: "static",
    evidence,
    data: { present: true, hitCount: hits.length, hitLines: hits.map((h) => h.line) },
  };
}

async function evidenceC03(
  facts: DockerfileFacts,
  executor: RuntimeExecutor,
  handle: RunHandle | null,
): Promise<RawCheck> {
  const exposed = facts.present ? facts.exposedPorts : [];
  const listening = handle ? await executor.listeningPorts(handle) : null;
  const exposedSensitive = exposed.filter((p) => SENSITIVE_PORTS[p]);
  const listeningSensitive = (listening ?? []).filter((p) => SENSITIVE_PORTS[p]);
  const describe = (ports: number[]) =>
    ports.map((p) => `${p}(${SENSITIVE_PORTS[p]})`).join(", ") || "없음";
  const parts = [
    `EXPOSE 민감포트: ${describe(exposedSensitive)}`,
    `LISTEN 민감포트: ${listening === null ? "확인 불가" : describe(listeningSensitive)}`,
  ];
  return {
    id: "C-03",
    source: listening !== null ? executor.source : "static",
    evidence: parts.join(" / "),
    data: {
      present: facts.present,
      exposedSensitive,
      listeningObserved: listening !== null,
      listeningSensitive,
    },
  };
}

function evidenceC04(facts: DockerfileFacts): RawCheck {
  if (!facts.present) {
    return { id: "C-04", source: "static", evidence: "Dockerfile 없음 — base 이미지 점검 대상 아님", data: { present: false } };
  }
  const { baseImage, baseTag, baseDigestPinned } = facts;
  let evidence: string;
  if (baseDigestPinned) evidence = `base 이미지 digest 고정: ${baseImage}`;
  else if (!baseTag) evidence = `base 이미지 태그 없음: ${baseImage ?? "(FROM 미검출)"}`;
  else evidence = `base 이미지 태그: ${baseImage}`;
  return {
    id: "C-04",
    source: "static",
    evidence,
    data: { present: true, baseImage, baseTag, baseDigestPinned },
  };
}

async function evidenceC05(executor: RuntimeExecutor, handle: RunHandle | null): Promise<RawCheck> {
  const pkgs = handle ? await executor.riskyPackages(handle) : null;
  if (pkgs === null) {
    return { id: "C-05", source: handle ? executor.source : "static", evidence: "실행 컨테이너 패키지 관찰 불가 (Docker 필요)", data: { observed: false } };
  }
  return {
    id: "C-05",
    source: executor.source,
    evidence: pkgs.length > 0 ? `상주 위험 도구: ${pkgs.join(", ")}` : "위험 도구 미검출",
    data: { observed: true, packages: pkgs },
  };
}

async function evidenceC06(executor: RuntimeExecutor, handle: RunHandle | null): Promise<RawCheck> {
  const bins = handle ? await executor.suidSgidBinaries(handle) : null;
  if (bins === null) {
    return { id: "C-06", source: handle ? executor.source : "static", evidence: "setuid/setgid 바이너리 관찰 불가 (Docker 필요)", data: { observed: false } };
  }
  const unexpected = bins.filter((b) => !EXPECTED_SUID.includes(b.split("/").pop() || ""));
  return {
    id: "C-06",
    source: executor.source,
    evidence: unexpected.length > 0 ? `예상 외 setuid/setgid: ${unexpected.join(", ")}` : `setuid/setgid ${bins.length}건 모두 기대 범위`,
    data: { observed: true, total: bins.length, unexpected },
  };
}

async function evidenceC07(executor: RuntimeExecutor, handle: RunHandle | null): Promise<RawCheck> {
  const writable = handle ? await executor.rootFsWritable(handle) : null;
  if (writable === null) {
    return { id: "C-07", source: handle ? executor.source : "static", evidence: "루트 FS 쓰기 가능 여부 관찰 불가 (Docker 필요)", data: { observed: false } };
  }
  return {
    id: "C-07",
    source: executor.source,
    evidence: writable ? "이미지 기본 실행 시 루트 FS 쓰기 가능 (--read-only 미강제)" : "루트 FS가 기본 읽기 전용",
    data: { observed: true, writable },
  };
}

function evidenceC08(facts: DockerfileFacts): RawCheck {
  if (!facts.present) {
    return { id: "C-08", source: "static", evidence: "Dockerfile 없음 — HEALTHCHECK 점검 대상 아님", data: { present: false } };
  }
  return {
    id: "C-08",
    source: "static",
    evidence: facts.hasHealthcheck ? "HEALTHCHECK 지시어 존재" : "HEALTHCHECK 지시어 없음",
    data: { present: true, hasHealthcheck: facts.hasHealthcheck },
  };
}

function evidenceC09(facts: DockerfileFacts): RawCheck {
  if (!facts.present) {
    return { id: "C-09", source: "static", evidence: "Dockerfile 없음 — ADD 점검 대상 아님", data: { present: false } };
  }
  const hits = facts.remoteAdds;
  return {
    id: "C-09",
    source: "static",
    evidence: hits.length > 0 ? `원격 URL ADD ${hits.length}건 (line ${hits.map((h) => h.line).join(", ")})` : "원격 URL ADD 미사용",
    data: { present: true, hitCount: hits.length },
  };
}

async function evidenceU16(executor: RuntimeExecutor, handle: RunHandle | null): Promise<RawCheck> {
  return evidenceFilePerm("U-16", "/etc/passwd", executor, handle);
}

// U-16/18/19/22 공통: 지정 파일의 소유자·권한을 evidence로 수집한다.
async function evidenceFilePerm(
  id: string,
  filePath: string,
  executor: RuntimeExecutor,
  handle: RunHandle | null,
): Promise<RawCheck> {
  if (!handle) {
    return { id, source: executor.source, evidence: "컨테이너 미실행 — 점검 불가", data: { present: false } };
  }
  const stat = await executor.statFile(handle, filePath);
  if (!stat) {
    return { id, source: executor.source, evidence: `${filePath} 파일 없음 — 대상 아님`, data: { present: false } };
  }
  return {
    id,
    source: executor.source,
    evidence: `${filePath} 소유자 ${stat.owner}:${stat.group}, 권한 ${stat.mode}`,
    data: { present: true, owner: stat.owner, group: stat.group, mode: stat.mode },
  };
}

// U-04: /etc/passwd 암호 필드에 crypt 해시가 직접 노출되면(shadow 미사용) 취약.
async function evidenceU04(executor: RuntimeExecutor, handle: RunHandle | null): Promise<RawCheck> {
  const content = handle ? await executor.readTextFile(handle, "/etc/passwd") : null;
  if (content === null) {
    return { id: "U-04", source: handle ? executor.source : "static", evidence: "/etc/passwd 읽기 불가 (Docker 필요)", data: { observed: false } };
  }
  const exposed: string[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const fields = line.split(":");
    if (fields.length < 2) continue;
    if (fields[1].startsWith("$")) exposed.push(fields[0]); // 암호 해시가 passwd에 직접 존재
  }
  return {
    id: "U-04",
    source: executor.source,
    evidence: exposed.length > 0 ? `passwd에 암호 해시 노출 계정: ${exposed.join(", ")}` : "암호가 shadow로 분리됨 (passwd 해시 노출 없음)",
    data: { observed: true, exposed },
  };
}

// U-05: root(UID 0) 외 계정에 UID 0이 부여되면 취약.
async function evidenceU05(executor: RuntimeExecutor, handle: RunHandle | null): Promise<RawCheck> {
  const content = handle ? await executor.readTextFile(handle, "/etc/passwd") : null;
  if (content === null) {
    return { id: "U-05", source: handle ? executor.source : "static", evidence: "/etc/passwd 읽기 불가 (Docker 필요)", data: { observed: false } };
  }
  const uid0: string[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const fields = line.split(":");
    if (fields.length < 3) continue;
    if (fields[2] === "0" && fields[0] !== "root") uid0.push(fields[0]);
  }
  return {
    id: "U-05",
    source: executor.source,
    evidence: uid0.length > 0 ? `root 외 UID 0 계정: ${uid0.join(", ")}` : "UID 0은 root 단독",
    data: { observed: true, uid0 },
  };
}

// U-25: others 쓰기 권한(world-writable) 파일 존재 여부.
async function evidenceU25(executor: RuntimeExecutor, handle: RunHandle | null): Promise<RawCheck> {
  const files = handle ? await executor.worldWritableFiles(handle) : null;
  if (files === null) {
    return { id: "U-25", source: handle ? executor.source : "static", evidence: "world-writable 파일 관찰 불가 (Docker 필요)", data: { observed: false } };
  }
  const sample = files.slice(0, 5).join(", ");
  return {
    id: "U-25",
    source: executor.source,
    evidence: files.length > 0 ? `world-writable 파일 ${files.length}건: ${sample}${files.length > 5 ? " ..." : ""}` : "world-writable 파일 없음",
    data: { observed: true, count: files.length, sample: files.slice(0, 10) },
  };
}
