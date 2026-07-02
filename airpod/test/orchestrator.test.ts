import { test } from "node:test";
import assert from "node:assert/strict";

// Claude 실제 호출을 막아 결정적 stub 리포트를 강제한다 (키 없으면 claude.ts가 stub로 대체).
delete process.env.ANTHROPIC_API_KEY;

import { runPipeline, type PipelineDeps } from "../src/lib/pipeline/orchestrator";
import type { RuntimeExecutor } from "../src/lib/executor/types";
import type { ScanRecord } from "../src/lib/types";
import { getCatalogItem } from "../src/lib/catalog";
import { FakeExecutor, vulnerableOptions, safeOptions } from "./helpers/fakes";
import { makeScan, memStore, VULN_DOCKERFILE, SAFE_DOCKERFILE } from "./helpers/fixtures";
import { VULN_TOKEN } from "./helpers/fixtures";

const FAKE_COMMIT_SHA = "deadbeef00112233445566778899aabbccddeef";

function deps(
  executor: RuntimeExecutor,
  dockerfileContent: string | null,
  store: ReturnType<typeof memStore>,
  opts: { cloneFails?: boolean } = {},
): Partial<PipelineDeps> {
  return {
    pickExecutor: async () => executor,
    cloneRepo: async (_repoUrl, _branch, _pat, candidatePath) => {
      if (opts.cloneFails) throw new Error("clone boom");
      return {
        workdir: "/fake/wd",
        dockerfilePath: candidatePath ? `/fake/wd/${candidatePath}` : "/fake/wd/Dockerfile",
        dockerfileContent,
        commitSha: FAKE_COMMIT_SHA,
      };
    },
    cleanupWorkdir: async () => {},
    saveScan: store.saveScan,
  };
}

const stages = (s: ScanRecord) => new Map(s.stages.map((st) => [st.id, st.status]));
const failIds = (s: ScanRecord) => s.results.filter((r) => r.status === "fail").map((r) => r.id).sort();

test("happy path: safe repo completes with all stages ok and zero fails", async () => {
  const store = memStore();
  const exec = new FakeExecutor(safeOptions());
  const scan = makeScan("safe1");
  await runPipeline(scan, deps(exec, SAFE_DOCKERFILE, store));

  const final = store.get("safe1")!;
  assert.equal(final.status, "completed");
  assert.equal(final.usedLocalImageFallback, false);
  assert.equal(final.executor, "docker");
  assert.equal(final.results.length, 23);
  assert.equal(failIds(final).length, 0);
  for (const st of final.stages) assert.equal(st.status, "ok", `stage ${st.id}`);
  assert.match(final.imageRef!, /airpod\/scan-safe1/);
  assert.equal(final.commitSha, FAKE_COMMIT_SHA, "commit SHA from a successful clone must be recorded");
  assert.match(final.imageRef!, new RegExp(FAKE_COMMIT_SHA.slice(0, 12)), "image tag must embed the short commit SHA");
  assert.equal(exec.stopped, true, "sandbox container must be stopped");
});

test("vulnerable repo: expected fails detected and Claude reports attached", async () => {
  const store = memStore();
  const scan = makeScan("vuln1");
  await runPipeline(scan, deps(new FakeExecutor(vulnerableOptions()), VULN_DOCKERFILE, store));

  const final = store.get("vuln1")!;
  assert.equal(final.status, "completed");
  for (const id of ["C-01", "C-02", "C-05", "U-05", "U-25"]) {
    assert.ok(failIds(final).includes(id), `expected ${id} to fail`);
  }
  // skip이 아닌 모든 항목에 판정+설명이 붙는다 (AI가 이제 판정도 하므로; 여기선 키 없어 stub 폴백)
  for (const r of final.results.filter((x) => x.status !== "skip")) {
    assert.ok(r.claude, `${r.id} should have a report`);
    assert.equal(r.claude!.generatedBy, "stub");
  }
});

test("AI judgement is authoritative: orchestrator uses judgeResults' status as-is, not a recomputed rule", async () => {
  const store = memStore();
  const scan = makeScan("ai1");
  // vulnerableOptions()는 rule engine이라면 C-01을 fail로 판정할 evidence(runtimeUid=0)를 만든다.
  const exec = new FakeExecutor(vulnerableOptions());
  await runPipeline(scan, {
    ...deps(exec, VULN_DOCKERFILE, store),
    judgeResults: async (raws) =>
      raws.map((r) => {
        const item = getCatalogItem(r.id);
        return {
          id: item.id,
          category: item.category,
          title: item.title,
          severity: item.severity,
          method: item.method,
          status: r.id === "C-01" ? "review" : "pass",
          source: r.source,
          evidence: r.evidence,
          claude: null,
        };
      }),
  });

  const final = store.get("ai1")!;
  assert.equal(final.results.find((r) => r.id === "C-01")!.status, "review", "orchestrator must trust the injected AI status, not recompute it");
  assert.ok(
    final.results.filter((r) => r.id !== "C-01").every((r) => r.status === "pass"),
    "non-overridden items should also reflect the injected judgeResults output",
  );
});

test("PAT never leaks into the persisted scan record", async () => {
  const store = memStore();
  const scan = makeScan("pat1", "https://example.com/repo.git");
  await runPipeline(scan, deps(new FakeExecutor(vulnerableOptions()), VULN_DOCKERFILE, store));

  const serialized = JSON.stringify(store.get("pat1"));
  assert.ok(!serialized.includes(VULN_TOKEN), "raw token must not appear anywhere in the record");
});

test("PAT never leaks even when the clone error message embeds a credentialed URL", async () => {
  const store = memStore();
  const scan = makeScan("pat2", "https://example.com/repo.git");
  const FAKE_PAT = "ghp_leaktest0123456789abcdefghijklmnop";
  await runPipeline(
    scan,
    {
      ...deps(new FakeExecutor(safeOptions()), SAFE_DOCKERFILE, store, { cloneFails: false }),
      // execFile 실패 시 Node가 실제로 명령/인자(인증 URL 포함)를 에러 메시지에 담는 것을 시뮬레이션한다.
      cloneRepo: async () => {
        throw new Error(`Command failed: git clone --depth 1 https://x-access-token:${FAKE_PAT}@example.com/repo.git /tmp/x`);
      },
    },
    FAKE_PAT,
  );

  const final = store.get("pat2")!;
  const serialized = JSON.stringify(final);
  assert.ok(!serialized.includes(FAKE_PAT), "PAT must not survive into the persisted scan record via error messages");
  assert.equal(final.status, "completed"); // clone 실패는 fallback으로 흡수되어 스캔 자체는 계속된다
});

test("clone failure ensures the fallback image, runs it, and completes", async () => {
  const store = memStore();
  const scan = makeScan("fb1");
  const exec = new FakeExecutor(safeOptions());
  await runPipeline(scan, deps(exec, null, store, { cloneFails: true }));

  const final = store.get("fb1")!;
  assert.equal(final.status, "completed");
  assert.equal(final.usedLocalImageFallback, true);
  assert.equal(final.imageRef, "airpod/fallback:local");
  assert.ok(exec.ensuredImages.includes("airpod/fallback:local"), "fallback image must be ensured");
  const st = stages(final);
  assert.equal(st.get("clone"), "failed");
  assert.equal(st.get("build"), "skipped");
  assert.equal(st.get("sandbox"), "ok"); // fallback 이미지로 sandbox가 실행됨
  assert.equal(st.get("done"), "ok");
  assert.equal(final.commitSha, undefined, "no successful clone → no commit SHA to report");
  // 정적 근거(Dockerfile)는 없지만 런타임 항목은 fallback 이미지에서 관찰된다
  assert.equal(final.results.find((r) => r.id === "C-05")!.status, "pass");
});

test("candidatePath is forwarded to cloneRepo and recorded on the scan", async () => {
  const store = memStore();
  const scan = makeScan("cand1");
  const exec = new FakeExecutor(safeOptions());
  await runPipeline(scan, deps(exec, SAFE_DOCKERFILE, store), undefined, "nginx/Dockerfile");

  const final = store.get("cand1")!;
  assert.equal(final.candidatePath, "nginx/Dockerfile");
  assert.equal(final.status, "completed");
});

test("ensureImage is not called on the normal (built-image) path", async () => {
  const store = memStore();
  const exec = new FakeExecutor(safeOptions());
  await runPipeline(makeScan("noens1"), deps(exec, SAFE_DOCKERFILE, store));
  assert.equal(exec.ensuredImages.length, 0);
});

test("sandbox failure degrades runtime checks without failing the scan", async () => {
  const store = memStore();
  const scan = makeScan("sb1");
  const exec = new FakeExecutor({ ...safeOptions(), runFails: true });
  await runPipeline(scan, deps(exec, SAFE_DOCKERFILE, store));

  const final = store.get("sb1")!;
  assert.equal(final.status, "completed");
  assert.equal(stages(final).get("sandbox"), "failed");
  // 런타임 관찰이 없으므로 지어낸 fail이 없어야 한다
  const c05 = final.results.find((r) => r.id === "C-05")!;
  assert.equal(c05.status, "review");
});

test("re-scan is deterministic: identical inputs yield identical judgements", async () => {
  const store = memStore();
  await runPipeline(makeScan("r1"), deps(new FakeExecutor(vulnerableOptions()), VULN_DOCKERFILE, store));
  await runPipeline(makeScan("r2"), deps(new FakeExecutor(vulnerableOptions()), VULN_DOCKERFILE, store));
  assert.deepEqual(failIds(store.get("r1")!), failIds(store.get("r2")!));
});
