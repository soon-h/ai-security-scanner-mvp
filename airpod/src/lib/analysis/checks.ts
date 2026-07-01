import type { RawCheck } from "../types";
import type { RuntimeExecutor, RunHandle } from "../executor/types";
import { analyzeDockerfile, type DockerfileFacts } from "./dockerfile";

// Ansible evidence 수집 단계에 해당한다 (spec 신뢰 경계의 첫 단계).
// Dockerfile 정적 분석(D) + executor 기반 런타임 점검(R)으로 원시 evidence를 만든다.
// 룰 평가(rules.ts)는 이 evidence만 보고 status를 산출한다.

export async function collectEvidence(
  dockerfileContent: string | null,
  executor: RuntimeExecutor,
  handle: RunHandle | null,
): Promise<RawCheck[]> {
  const facts = analyzeDockerfile(dockerfileContent);
  const checks: RawCheck[] = [];

  checks.push(await evidenceC01(facts, executor, handle));
  checks.push(evidenceC02(facts));
  checks.push(await evidenceU16(executor, handle));

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

async function evidenceU16(executor: RuntimeExecutor, handle: RunHandle | null): Promise<RawCheck> {
  if (!handle) {
    return { id: "U-16", source: executor.source, evidence: "컨테이너 미실행 — 점검 불가", data: { present: false } };
  }
  const stat = await executor.statFile(handle, "/etc/passwd");
  if (!stat) {
    return { id: "U-16", source: executor.source, evidence: "/etc/passwd 파일 없음 — 대상 아님", data: { present: false } };
  }
  return {
    id: "U-16",
    source: executor.source,
    evidence: `/etc/passwd 소유자 ${stat.owner}:${stat.group}, 권한 ${stat.mode}`,
    data: { present: true, owner: stat.owner, group: stat.group, mode: stat.mode },
  };
}
