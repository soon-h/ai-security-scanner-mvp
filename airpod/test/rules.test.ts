import { test } from "node:test";
import assert from "node:assert/strict";
import { collectEvidence } from "../src/lib/analysis/checks";
import { evaluateAll } from "../src/lib/analysis/rules";
import type { RunHandle } from "../src/lib/executor/types";
import type { CheckStatus } from "../src/lib/types";
import { FakeExecutor, vulnerableOptions, safeOptions } from "./helpers/fakes";
import { VULN_DOCKERFILE, SAFE_DOCKERFILE } from "./helpers/fixtures";

const HANDLE: RunHandle = { containerId: "c", imageRef: "i" };

async function statusMap(dockerfile: string | null, executor: FakeExecutor, handle: RunHandle | null) {
  const raws = await collectEvidence(dockerfile, executor, handle);
  const results = evaluateAll(raws);
  return new Map<string, CheckStatus>(results.map((r) => [r.id, r.status]));
}

test("vulnerable fixture: every check fails except the well-configured one (U-19)", async () => {
  const m = await statusMap(VULN_DOCKERFILE, new FakeExecutor(vulnerableOptions()), HANDLE);
  const shouldFail = ["C-01","C-02","C-03","C-04","C-05","C-06","C-07","C-08","C-09","U-04","U-05","U-16","U-18","U-22","U-25"];
  for (const id of shouldFail) assert.equal(m.get(id), "fail", `${id} should fail`);
  assert.equal(m.get("U-19"), "pass"); // /etc/hosts 644 = 양호
});

test("safe fixture: every check passes (guards against rule fallthrough)", async () => {
  const m = await statusMap(SAFE_DOCKERFILE, new FakeExecutor(safeOptions()), HANDLE);
  for (const [id, status] of m) assert.equal(status, "pass", `${id} should pass, got ${status}`);
});

test("no runtime observation: unobservable → review/skip, never a fabricated fail", async () => {
  // 모든 런타임 관찰이 null인 fake (컨테이너는 떴지만 아무것도 못 봄) + 안전한 Dockerfile
  const m = await statusMap(SAFE_DOCKERFILE, new FakeExecutor({}), HANDLE);
  assert.ok(![...m.values()].includes("fail"), "must not invent fails without evidence");
  for (const id of ["C-05", "C-06", "C-07", "U-04", "U-05", "U-25"]) {
    assert.equal(m.get(id), "review", `${id} → review`);
  }
  for (const id of ["U-16", "U-18", "U-19", "U-22"]) {
    assert.equal(m.get(id), "skip", `${id} → skip (파일 없음)`);
  }
  // 정적 근거만으로 판정 가능한 항목은 여전히 pass
  assert.equal(m.get("C-01"), "pass");
  assert.equal(m.get("C-08"), "pass");
});

test("source is propagated from the executor into results", async () => {
  const raws = await collectEvidence(SAFE_DOCKERFILE, new FakeExecutor(safeOptions()), HANDLE);
  const c05 = raws.find((r) => r.id === "C-05");
  assert.equal(c05?.source, "docker");
});
