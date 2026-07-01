import path from "node:path";
import type { ScanRecord, StageId, StageState, CheckResult } from "../types";
import { saveScan as defaultSaveScan } from "../store";
import { pickExecutor as defaultPickExecutor } from "../executor";
import type { RuntimeExecutor, RunHandle } from "../executor/types";
import { cloneRepo as defaultCloneRepo, cleanupWorkdir as defaultCleanupWorkdir, type CloneResult } from "./repo";
import { collectEvidence } from "../analysis/checks";
import { evaluateAll } from "../analysis/rules";
import { analyzeResults as defaultAnalyzeResults } from "../analysis/claude";

const FALLBACK_IMAGE = "airpod/fallback:local";
// fallback 이미지 빌드 컨텍스트. 앱 루트(process.cwd())의 fallback/ 디렉터리에 Dockerfile이 있다.
const FALLBACK_CONTEXT = path.join(process.cwd(), "fallback");

// 파이프라인이 의존하는 외부 어댑터. 기본값은 실제 구현이며, 테스트는 fake로 교체한다 (spec: 단일 seam).
export interface PipelineDeps {
  pickExecutor: () => Promise<RuntimeExecutor>;
  cloneRepo: (repoUrl: string) => Promise<CloneResult>;
  cleanupWorkdir: (workdir: string) => Promise<void>;
  analyzeResults: (results: CheckResult[]) => Promise<CheckResult[]>;
  saveScan: (scan: ScanRecord) => Promise<void>;
}

const defaultDeps: PipelineDeps = {
  pickExecutor: defaultPickExecutor,
  cloneRepo: defaultCloneRepo,
  cleanupWorkdir: defaultCleanupWorkdir,
  analyzeResults: defaultAnalyzeResults,
  saveScan: defaultSaveScan,
};

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

// 파이프라인 본체. scan 레코드를 단계별로 갱신하며 저장한다.
// clone/build 실패 시 local image fallback으로 핵심 점검 흐름을 계속한다 (spec §8-A-4).
// overrides로 어댑터(executor/clone/analyze/store)를 주입할 수 있어 seam 단위 테스트가 가능하다.
export async function runPipeline(scan: ScanRecord, overrides: Partial<PipelineDeps> = {}): Promise<void> {
  const deps = { ...defaultDeps, ...overrides };
  const save = deps.saveScan;

  const begin = async (id: StageId, detail?: string) => {
    const s = stage(scan, id);
    s.status = "running";
    s.detail = detail;
    s.startedAt = new Date().toISOString();
    await save(scan);
  };
  const finish = async (id: StageId, status: StageState["status"], detail?: string) => {
    const s = stage(scan, id);
    s.status = status;
    if (detail) s.detail = detail;
    s.endedAt = new Date().toISOString();
    await save(scan);
  };

  const executor: RuntimeExecutor = await deps.pickExecutor();
  scan.executor = executor.kind;
  await save(scan);

  let clone: CloneResult | null = null;
  let handle: RunHandle | null = null;

  try {
    // 1. Clone
    await begin("clone", `executor=${executor.kind}`);
    try {
      clone = await deps.cloneRepo(scan.repoUrl);
      await finish(
        "clone",
        "ok",
        clone.dockerfilePath ? `Dockerfile 감지: ${clone.dockerfilePath.split(/[\\/]/).pop()}` : "Dockerfile 없음",
      );
    } catch (err) {
      scan.usedLocalImageFallback = true;
      await finish("clone", "failed", `clone 실패 → local image fallback: ${(err as Error).message}`);
    }

    // 2. Build
    await begin("build");
    let imageRef = FALLBACK_IMAGE;
    if (clone?.workdir) {
      try {
        const built = await executor.build(clone.workdir, `airpod/scan-${scan.id}:latest`);
        imageRef = built.imageRef;
        await finish("build", "ok", built.logTail.split("\n").slice(-1)[0] || "build ok");
      } catch (err) {
        scan.usedLocalImageFallback = true;
        imageRef = FALLBACK_IMAGE;
        await finish("build", "failed", `build 실패 → local image fallback: ${(err as Error).message}`);
      }
    } else {
      scan.usedLocalImageFallback = true;
      await finish("build", "skipped", "clone 실패로 build 생략 → local image fallback");
    }
    scan.imageRef = imageRef;
    await save(scan);

    // 3. Sandbox 실행 (격리 옵션)
    await begin("sandbox");
    try {
      // fallback 이미지를 쓰는 경우 로컬에 없으면 번들된 Dockerfile로 빌드해 둔다.
      if (imageRef === FALLBACK_IMAGE) {
        await executor.ensureImage(FALLBACK_IMAGE, FALLBACK_CONTEXT);
      }
      handle = await executor.run(imageRef);
      await finish("sandbox", "ok", `container=${handle.containerId.slice(0, 12)} (network none, read-only, cap-drop ALL)`);
    } catch (err) {
      handle = null;
      await finish("sandbox", "failed", `sandbox 실행 실패 — 런타임 항목은 skip/review 처리: ${(err as Error).message}`);
    }

    // 4. Ansible 점검 (evidence 수집)
    await begin("ansible");
    const raws = await collectEvidence(clone?.dockerfileContent ?? null, executor, handle);
    await finish("ansible", "ok", `${raws.length}개 항목 evidence 수집 (source=${executor.source})`);

    // 5. 가이드 기반 룰 평가
    await begin("rule_eval");
    let results = evaluateAll(raws);
    scan.results = results;
    const failCount = results.filter((r) => r.status === "fail").length;
    await finish("rule_eval", "ok", `fail ${failCount}건 / 전체 ${results.length}건`);

    // 6. Claude 분석 (AI 실패는 점검 실패와 분리)
    await begin("claude");
    results = await deps.analyzeResults(results);
    scan.results = results;
    const aiCount = results.filter((r) => r.claude).length;
    await finish("claude", "ok", `${aiCount}개 항목 리포트 생성`);

    // 7. 완료
    await begin("done");
    await finish("done", "ok");
    scan.status = "completed";
    await save(scan);
  } catch (err) {
    scan.status = "failed";
    scan.error = (err as Error).message;
    await save(scan);
  } finally {
    if (handle) await executor.stop(handle);
    if (clone?.workdir) await deps.cleanupWorkdir(clone.workdir);
  }
}
