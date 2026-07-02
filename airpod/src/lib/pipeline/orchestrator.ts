import path from "node:path";
import type { ScanRecord, StageId, StageState, RawCheck, CheckResult } from "../types";
import { saveScan as defaultSaveScan } from "../store";
import { pickExecutor as defaultPickExecutor } from "../executor";
import type { RuntimeExecutor, RunHandle } from "../executor/types";
import { cloneRepo as defaultCloneRepo, cleanupWorkdir as defaultCleanupWorkdir, type CloneResult } from "./repo";
import { collectEvidence } from "../analysis/checks";
import { judgeAll as defaultJudgeResults } from "../analysis/claude";
import { sanitize } from "../analysis/sanitize";

const FALLBACK_IMAGE = "airpod/fallback:local";
// fallback 이미지 빌드 컨텍스트. 앱 루트(process.cwd())의 fallback/ 디렉터리에 Dockerfile이 있다.
const FALLBACK_CONTEXT = path.join(process.cwd(), "fallback");

// 파이프라인이 의존하는 외부 어댑터. 기본값은 실제 구현이며, 테스트는 fake로 교체한다 (spec: 단일 seam).
export interface PipelineDeps {
  pickExecutor: () => Promise<RuntimeExecutor>;
  cloneRepo: (repoUrl: string, branch: string, pat?: string) => Promise<CloneResult>;
  cleanupWorkdir: (workdir: string) => Promise<void>;
  judgeResults: (raws: RawCheck[]) => Promise<CheckResult[]>;
  saveScan: (scan: ScanRecord) => Promise<void>;
}

const defaultDeps: PipelineDeps = {
  pickExecutor: defaultPickExecutor,
  cloneRepo: defaultCloneRepo,
  cleanupWorkdir: defaultCleanupWorkdir,
  judgeResults: defaultJudgeResults,
  saveScan: defaultSaveScan,
};

export function initialStages(): StageState[] {
  const defs: { id: StageId; label: string }[] = [
    { id: "clone", label: "Clone" },
    { id: "build", label: "Build" },
    { id: "sandbox", label: "Sandbox 실행" },
    { id: "ansible", label: "Ansible 점검" },
    { id: "claude", label: "AI 판정 및 설명" },
    { id: "done", label: "완료" },
  ];
  return defs.map((d) => ({ id: d.id, label: d.label, status: "pending" }));
}

function stage(scan: ScanRecord, id: StageId): StageState {
  const s = scan.stages.find((x) => x.id === id);
  if (!s) throw new Error(`missing stage ${id}`);
  return s;
}

// 실행 실패 메시지를 영속화하기 전에 sanitize한다. clone에 PAT 인증 URL을 썼다면
// execFile 실패 메시지에 그 URL이 그대로 담길 수 있어(Node가 명령/인자를 에러에 포함시킴),
// 이 경로가 사실상 유일한 PAT 유출 지점이다 — sanitize.ts의 url_creds 패턴으로 걸러낸다.
function safeMsg(err: unknown): string {
  return sanitize((err as Error).message).text;
}

// 파이프라인 본체. scan 레코드를 단계별로 갱신하며 저장한다.
// clone/build 실패 시 local image fallback으로 핵심 점검 흐름을 계속한다 (spec §8-A-4).
// overrides로 어댑터(executor/clone/analyze/store)를 주입할 수 있어 seam 단위 테스트가 가능하다.
// pat은 scan/deps 어디에도 저장하지 않고 clone 1회 호출에만 전달한다(spec story 3: 장기 평문 저장 금지).
export async function runPipeline(scan: ScanRecord, overrides: Partial<PipelineDeps> = {}, pat?: string): Promise<void> {
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
      clone = await deps.cloneRepo(scan.repoUrl, scan.branch, pat);
      await finish(
        "clone",
        "ok",
        clone.dockerfilePath ? `Dockerfile 감지: ${clone.dockerfilePath.split(/[\\/]/).pop()}` : "Dockerfile 없음",
      );
    } catch (err) {
      scan.usedLocalImageFallback = true;
      await finish("clone", "failed", `clone 실패 → local image fallback: ${safeMsg(err)}`);
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
        await finish("build", "failed", `build 실패 → local image fallback: ${safeMsg(err)}`);
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
      await finish("sandbox", "failed", `sandbox 실행 실패 — 런타임 항목은 skip/review 처리: ${safeMsg(err)}`);
    }

    // 4. Ansible 점검 (evidence 수집)
    await begin("ansible");
    const raws = await collectEvidence(clone?.dockerfileContent ?? null, executor, handle);
    await finish("ansible", "ok", `${raws.length}개 항목 evidence 수집 (source=${executor.source})`);

    // 5. AI 판정 및 설명 (AI 실패는 점검 실패와 분리 — 실패 시 결정론적 폴백 판정 사용)
    await begin("claude");
    const results = await deps.judgeResults(raws);
    scan.results = results;
    const failCount = results.filter((r) => r.status === "fail").length;
    const stubCount = results.filter((r) => r.claude?.generatedBy === "stub").length;
    await finish("claude", "ok", `취약 ${failCount}건 / 전체 ${results.length}건 (폴백 판정 ${stubCount}건)`);

    // 6. 완료
    await begin("done");
    await finish("done", "ok");
    scan.status = "completed";
    await save(scan);
  } catch (err) {
    scan.status = "failed";
    scan.error = safeMsg(err);
    await save(scan);
  } finally {
    if (handle) await executor.stop(handle);
    if (clone?.workdir) await deps.cleanupWorkdir(clone.workdir);
  }
}
