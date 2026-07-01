import type { ScanRecord, StageId, StageState } from "../types";
import { saveScan } from "../store";
import { pickExecutor } from "../executor";
import type { RuntimeExecutor, RunHandle } from "../executor/types";
import { cloneRepo, cleanupWorkdir, type CloneResult } from "./repo";
import { collectEvidence } from "../analysis/checks";
import { evaluateAll } from "../analysis/rules";
import { analyzeResults } from "../analysis/claude";

const FALLBACK_IMAGE = "airpod/fallback:local";

export function initialStages(): StageState[] {
  const defs: { id: StageId; label: string }[] = [
    { id: "clone", label: "Clone" },
    { id: "build", label: "Build" },
    { id: "sandbox", label: "Sandbox 실행" },
    { id: "ansible", label: "Ansible 점검" },
    { id: "rule_eval", label: "가이드 기반 룰 평가" },
    { id: "claude", label: "Claude 분석" },
    { id: "done", label: "완료" },
  ];
  return defs.map((d) => ({ id: d.id, label: d.label, status: "pending" }));
}

function stage(scan: ScanRecord, id: StageId): StageState {
  const s = scan.stages.find((x) => x.id === id);
  if (!s) throw new Error(`missing stage ${id}`);
  return s;
}

async function begin(scan: ScanRecord, id: StageId, detail?: string) {
  const s = stage(scan, id);
  s.status = "running";
  s.detail = detail;
  s.startedAt = new Date().toISOString();
  await saveScan(scan);
}

async function finish(scan: ScanRecord, id: StageId, status: StageState["status"], detail?: string) {
  const s = stage(scan, id);
  s.status = status;
  if (detail) s.detail = detail;
  s.endedAt = new Date().toISOString();
  await saveScan(scan);
}

// 파이프라인 본체. scan 레코드를 단계별로 갱신하며 저장한다.
// clone/build 실패 시 local image fallback으로 핵심 점검 흐름을 계속한다 (spec §8-A-4).
export async function runPipeline(scan: ScanRecord): Promise<void> {
  const executor: RuntimeExecutor = await pickExecutor();
  scan.executor = executor.kind;
  await saveScan(scan);

  let clone: CloneResult | null = null;
  let handle: RunHandle | null = null;

  try {
    // 1. Clone
    await begin(scan, "clone", `executor=${executor.kind}`);
    try {
      clone = await cloneRepo(scan.repoUrl);
      await finish(
        scan,
        "clone",
        "ok",
        clone.dockerfilePath ? `Dockerfile 감지: ${clone.dockerfilePath.split(/[\\/]/).pop()}` : "Dockerfile 없음",
      );
    } catch (err) {
      scan.usedLocalImageFallback = true;
      await finish(scan, "clone", "failed", `clone 실패 → local image fallback: ${(err as Error).message}`);
    }

    // 2. Build
    await begin(scan, "build");
    let imageRef = FALLBACK_IMAGE;
    if (clone?.workdir) {
      try {
        const built = await executor.build(clone.workdir, `airpod/scan-${scan.id}:latest`);
        imageRef = built.imageRef;
        await finish(scan, "build", "ok", built.logTail.split("\n").slice(-1)[0] || "build ok");
      } catch (err) {
        scan.usedLocalImageFallback = true;
        imageRef = FALLBACK_IMAGE;
        await finish(scan, "build", "failed", `build 실패 → local image fallback: ${(err as Error).message}`);
      }
    } else {
      scan.usedLocalImageFallback = true;
      await finish(scan, "build", "skipped", "clone 실패로 build 생략 → local image fallback");
    }
    scan.imageRef = imageRef;
    await saveScan(scan);

    // 3. Sandbox 실행 (격리 옵션)
    await begin(scan, "sandbox");
    try {
      handle = await executor.run(imageRef);
      await finish(scan, "sandbox", "ok", `container=${handle.containerId.slice(0, 12)} (network none, read-only, cap-drop ALL)`);
    } catch (err) {
      handle = null;
      await finish(scan, "sandbox", "failed", `sandbox 실행 실패 — 런타임 항목은 skip/review 처리: ${(err as Error).message}`);
    }

    // 4. Ansible 점검 (evidence 수집)
    await begin(scan, "ansible");
    const raws = await collectEvidence(clone?.dockerfileContent ?? null, executor, handle);
    await finish(scan, "ansible", "ok", `${raws.length}개 항목 evidence 수집 (source=${executor.source})`);

    // 5. 가이드 기반 룰 평가
    await begin(scan, "rule_eval");
    let results = evaluateAll(raws);
    scan.results = results;
    const failCount = results.filter((r) => r.status === "fail").length;
    await finish(scan, "rule_eval", "ok", `fail ${failCount}건 / 전체 ${results.length}건`);

    // 6. Claude 분석 (AI 실패는 점검 실패와 분리)
    await begin(scan, "claude");
    results = await analyzeResults(results);
    scan.results = results;
    const aiCount = results.filter((r) => r.claude).length;
    await finish(scan, "claude", "ok", `${aiCount}개 항목 리포트 생성`);

    // 7. 완료
    await begin(scan, "done");
    await finish(scan, "done", "ok");
    scan.status = "completed";
    await saveScan(scan);
  } catch (err) {
    scan.status = "failed";
    scan.error = (err as Error).message;
    await saveScan(scan);
  } finally {
    if (handle) await executor.stop(handle);
    if (clone?.workdir) await cleanupWorkdir(clone.workdir);
  }
}
