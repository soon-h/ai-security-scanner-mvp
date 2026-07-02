import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderReportHtml } from "../src/lib/report";
import type { CheckResult, ScanRecord } from "../src/lib/types";

function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: "C-01",
    category: "container_hardening",
    title: "root(UID 0) 실행",
    severity: "High",
    method: "R",
    status: "fail",
    source: "docker",
    evidence: "실행 UID: 0",
    claude: {
      id: "C-01",
      status: "fail",
      severity: "High",
      title: "root(UID 0) 실행",
      evidence: "실행 UID: 0",
      reason: "root 권한 위험",
      remediation: "non-root 사용자로 전환",
      example: "USER app",
      generatedBy: "stub",
    },
    ...overrides,
  };
}

function makeScan(overrides: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: "s1",
    repoUrl: "https://example.com/repo.git",
    branch: "main",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "completed",
    executor: "docker",
    usedLocalImageFallback: false,
    stages: [],
    results: [makeResult()],
    ...overrides,
  };
}

test("escapeHtml: escapes all five HTML-significant characters", () => {
  assert.equal(escapeHtml(`<script>alert("x")&'y'</script>`), "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;y&#39;&lt;/script&gt;");
});

test("renderReportHtml: never emits an unescaped <script> tag from untrusted fields (XSS regression)", () => {
  const payload = `<script>alert(1)</script>`;
  const scan = makeScan({
    repoUrl: `https://example.com/${payload}.git`,
    results: [
      makeResult({
        evidence: payload,
        title: payload,
        comments: [{ id: "c1", text: payload, createdAt: "2026-01-01T00:00:00.000Z" }],
        claude: {
          id: "C-01",
          status: "fail",
          severity: "High",
          title: payload,
          evidence: payload,
          reason: payload,
          remediation: payload,
          example: payload,
          generatedBy: "stub",
        },
      }),
    ],
  });

  const html = renderReportHtml([scan]);
  assert.ok(!html.includes("<script>"), "raw <script> tag must never appear in the rendered report");
  assert.ok(html.includes("&lt;script&gt;"), "the payload should still be visible, just escaped");
});

test("renderReportHtml: includes a section per scan and the correct check ids", () => {
  const html = renderReportHtml([makeScan({ id: "a" }), makeScan({ id: "b" })]);
  assert.match(html, /scan a/);
  assert.match(html, /scan b/);
  assert.equal((html.match(/class="scan"/g) ?? []).length, 2);
});

test("renderReportHtml: shows override note only when an override is present", () => {
  const withOverride = renderReportHtml([
    makeScan({ results: [makeResult({ override: { status: "pass", updatedAt: "2026-01-01T00:00:00.000Z" } })] }),
  ]);
  assert.match(withOverride, /담당자 수정/);

  const withoutOverride = renderReportHtml([makeScan({ results: [makeResult({ override: null })] })]);
  assert.doesNotMatch(withoutOverride, /담당자 수정/);
});

test("renderReportHtml: skip items with no claude report show the fallback note instead of a Claude block", () => {
  const html = renderReportHtml([
    makeScan({ results: [makeResult({ status: "skip", claude: null, evidence: "대상 아님" })] }),
  ]);
  assert.match(html, /자동 판정 대상이 아니라 AI 설명이 없습니다/);
});
