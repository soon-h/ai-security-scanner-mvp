import { test } from "node:test";
import assert from "node:assert/strict";
import { setOverride, addComment, applyResultPatch, isOverridableStatus } from "../src/lib/overrides";
import { effectiveStatus } from "../src/lib/types";
import type { CheckResult, ScanRecord } from "../src/lib/types";

function makeResult(id: string, status: CheckResult["status"] = "pass"): CheckResult {
  return {
    id,
    category: "container_hardening",
    title: "test item",
    severity: "High",
    method: "R",
    status,
    source: "docker",
    evidence: "evidence text",
    claude: null,
  };
}

function makeScan(results: CheckResult[]): ScanRecord {
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
    results,
  };
}

test("isOverridableStatus: only pass/fail/review are valid", () => {
  assert.equal(isOverridableStatus("pass"), true);
  assert.equal(isOverridableStatus("fail"), true);
  assert.equal(isOverridableStatus("review"), true);
  assert.equal(isOverridableStatus("skip"), false);
  assert.equal(isOverridableStatus("not_automated"), false);
  assert.equal(isOverridableStatus(123), false);
});

test("setOverride: applies and clears an override without touching status/claude", () => {
  const r = makeResult("C-01", "pass");
  const overridden = setOverride(r, "fail");
  assert.equal(overridden.override?.status, "fail");
  assert.equal(overridden.status, "pass", "original AI/fallback status must be preserved");
  assert.equal(effectiveStatus(overridden), "fail");

  const cleared = setOverride(overridden, null);
  assert.equal(cleared.override, null);
  assert.equal(effectiveStatus(cleared), "pass");
});

test("effectiveStatus: falls back to status when no override", () => {
  const r = makeResult("C-01", "skip");
  assert.equal(effectiveStatus(r), "skip");
});

test("addComment: appends without clobbering existing comments", () => {
  const r = makeResult("C-01");
  const withOne = addComment(r, "first note");
  const withTwo = addComment(withOne, "second note");
  assert.equal(withTwo.comments?.length, 2);
  assert.equal(withTwo.comments?.[0].text, "first note");
  assert.equal(withTwo.comments?.[1].text, "second note");
  assert.ok(withTwo.comments?.[0].id);
});

test("applyResultPatch: returns null when checkId is not found", () => {
  const scan = makeScan([makeResult("C-01")]);
  assert.equal(applyResultPatch(scan, "C-99", { overrideStatus: "fail" }), null);
});

test("applyResultPatch: overrideStatus-only patch", () => {
  const scan = makeScan([makeResult("C-01", "pass")]);
  const updated = applyResultPatch(scan, "C-01", { overrideStatus: "review" });
  assert.equal(updated?.override?.status, "review");
  assert.equal(scan.results[0].override?.status, "review", "mutation reflected in scan.results");
});

test("applyResultPatch: comment-only patch leaves override untouched", () => {
  const scan = makeScan([makeResult("C-01")]);
  const updated = applyResultPatch(scan, "C-01", { comment: "looks fine to me" });
  assert.equal(updated?.override, undefined);
  assert.equal(updated?.comments?.length, 1);
  assert.equal(updated?.comments?.[0].text, "looks fine to me");
});

test("applyResultPatch: both override and comment in one patch", () => {
  const scan = makeScan([makeResult("C-01", "fail")]);
  const updated = applyResultPatch(scan, "C-01", { overrideStatus: "pass", comment: "verified manually" });
  assert.equal(updated?.override?.status, "pass");
  assert.equal(updated?.comments?.length, 1);
});
