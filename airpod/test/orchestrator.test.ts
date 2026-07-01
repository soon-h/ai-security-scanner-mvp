import { test } from "node:test";
import assert from "node:assert/strict";

// Claude 실제 호출을 막아 결정적 stub 리포트를 강제한다 (키 없으면 claude.ts가 stub로 대체).
delete process.env.ANTHROPIC_API_KEY;

import { runPipeline, type PipelineDeps } from "../src/lib/pipeline/orchestrator";
import type { RuntimeExecutor } from "../src/lib/executor/types";
import type { ScanRecord } from "../src/lib/types";
import { FakeExecutor, vulnerableOptions, safeOptions } from "./helpers/fakes";
import { makeScan, memStore, VULN_DOCKERFILE, SAFE_DOCKERFILE } from "./helpers/fixtures";
import { VULN_TOKEN } from "./helpers/fixtures";

function deps(
  executor: RuntimeExecutor,
  dockerfileContent: string | null,
  store: ReturnType<typeof memStore>,
  opts: { cloneFails?: boolean } = {},
): Partial<PipelineDeps> {
  return {
    pickExecutor: async () => executor,
    cloneRepo: async () => {
      if (opts.cloneFails) throw new Error("clone boom");
      return { workdir: "/fake/wd", dockerfilePath: "/fake/wd/Dockerfile", dockerfileContent };
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
  assert.equal(final.results.length, 16);
  assert.equal(failIds(final).length, 0);
  for (const st of final.stages) assert.equal(st.status, "ok", `stage ${st.id}`);
  assert.match(final.imageRef!, /airpod\/scan-safe1/);
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
  // fail 항목에는 Claude 설명이 붙는다 (AI 실패와 점검 실패는 분리; 여기선 stub)
  for (const r of final.results.filter((x) => x.status === "fail")) {
    assert.ok(r.claude, `${r.id} should have a report`);
    assert.equal(r.claude!.generatedBy, "stub");
  }
});

test("PAT never leaks into the persisted scan record", async () => {
  const store = memStore();
  const scan = makeScan("pat1", "https://example.com/repo.git");
  await runPipeline(scan, deps(new FakeExecutor(vulnerableOptions()), VULN_DOCKERFILE, store));

  const serialized = JSON.stringify(store.get("pat1"));
  assert.ok(!serialized.includes(VULN_TOKEN), "raw token must not appear anywhere in the record");
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
  // 정적 근거(Dockerfile)는 없지만 런타임 항목은 fallback 이미지에서 관찰된다
  assert.equal(final.results.find((r) => r.id === "C-05")!.status, "pass");
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
