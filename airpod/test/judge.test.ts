import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeAll } from "../src/lib/analysis/claude";
import type { RawCheck } from "../src/lib/types";

// C-02(하드코딩 시크릿)를 대상으로 쓴다: present=false → skip, hitCount>0 → 룰 폴백은 fail.
const SKIP_RAW: RawCheck = {
  id: "C-02",
  source: "static",
  evidence: "Dockerfile 없음 — 정적 시크릿 점검 대상 아님",
  data: { present: false },
};

const FAIL_RAW: RawCheck = {
  id: "C-02",
  source: "static",
  evidence: "민감 키에 하드코딩된 값 1건 (line 2)",
  data: { present: true, hitCount: 1, hitLines: [2] },
};

// C-01은 hitCount 없이 runtimeUid=1000이면 rules.ts 폴백이 pass가 된다.
const PASS_RAW: RawCheck = {
  id: "C-01",
  source: "docker",
  evidence: "실행 UID: 1000",
  data: { userDirective: "app", runtimeUid: 1000 },
};

function withEnvKey<T>(key: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ANTHROPIC_API_KEY;
  if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = key;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  });
}

function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const prev = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = prev;
  });
}

test("skip items never call Claude, regardless of API key presence", async () => {
  await withEnvKey("test-key", () =>
    withFetch(
      (async () => {
        throw new Error("fetch must not be called for skip items");
      }) as unknown as typeof fetch,
      async () => {
        const [result] = await judgeAll([SKIP_RAW]);
        assert.equal(result.status, "skip");
        assert.equal(result.claude, null);
      },
    ),
  );
});

test("no API key: non-skip items fall back to the deterministic rule status", async () => {
  await withEnvKey(undefined, async () => {
    const [result] = await judgeAll([FAIL_RAW]);
    assert.equal(result.status, "fail"); // rules.ts: hitCount > 0 → fail
    assert.ok(result.claude);
    assert.equal(result.claude!.generatedBy, "stub");
  });
});

test("pass status → remediation/example are forced empty even if the fallback/model would say otherwise", async () => {
  await withEnvKey(undefined, async () => {
    const [result] = await judgeAll([PASS_RAW]);
    assert.equal(result.status, "pass");
    assert.equal(result.claude!.remediation, "");
    assert.equal(result.claude!.example, "");
  });

  const fakeFetchPass = (async () =>
    new Response(
      JSON.stringify({
        content: [
          {
            type: "tool_use",
            name: "emit_report",
            input: {
              status: "pass",
              situation: "적절히 설정됨",
              reason: "evidence상 문제 없음",
              remediation: "그래도 이렇게 하세요", // Claude가 실수로 채워도 무시돼야 한다
              example: "some example",
            },
          },
        ],
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

  await withEnvKey("test-key", () =>
    withFetch(fakeFetchPass, async () => {
      const [result] = await judgeAll([PASS_RAW]);
      assert.equal(result.status, "pass");
      assert.equal(result.claude!.generatedBy, "claude");
      assert.equal(result.claude!.remediation, "", "remediation must be forced empty on pass regardless of model output");
    }),
  );
});

test("Claude's judged status is authoritative over the deterministic rule status", async () => {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        content: [
          {
            type: "tool_use",
            name: "emit_report",
            input: {
              status: "review", // 룰 폴백이라면 fail이었을 evidence — AI가 다르게 판정
              situation: "AI가 파악한 현재 상황",
              reason: "AI가 독립적으로 판정한 이유",
              remediation: "AI가 제시한 조치",
              example: "example",
            },
          },
        ],
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

  await withEnvKey("test-key", () =>
    withFetch(fakeFetch, async () => {
      const [result] = await judgeAll([FAIL_RAW]);
      assert.equal(result.status, "review");
      assert.ok(result.claude);
      assert.equal(result.claude!.generatedBy, "claude");
      assert.equal(result.claude!.reason, "AI가 독립적으로 판정한 이유");
    }),
  );
});
