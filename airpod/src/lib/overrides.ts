import { randomUUID } from "node:crypto";
import type { CheckResult, Comment, OverridableStatus, ScanRecord } from "./types";

const OVERRIDABLE_STATUSES: OverridableStatus[] = ["pass", "fail", "review"];

export function isOverridableStatus(v: unknown): v is OverridableStatus {
  return typeof v === "string" && (OVERRIDABLE_STATUSES as string[]).includes(v);
}

// status가 null이면 override를 제거해 AI/폴백 판정(result.status)으로 되돌린다.
export function setOverride(result: CheckResult, status: OverridableStatus | null): CheckResult {
  return { ...result, override: status ? { status, updatedAt: new Date().toISOString() } : null };
}

export function addComment(result: CheckResult, text: string): CheckResult {
  const comment: Comment = { id: randomUUID(), text, createdAt: new Date().toISOString() };
  return { ...result, comments: [...(result.comments ?? []), comment] };
}

export interface ResultPatch {
  overrideStatus?: OverridableStatus | null;
  comment?: string;
}

// scan.results에서 checkId를 찾아 patch를 적용하고 배열에 반영한다. 못 찾으면 null(호출부가 404 처리).
export function applyResultPatch(scan: ScanRecord, checkId: string, patch: ResultPatch): CheckResult | null {
  const idx = scan.results.findIndex((r) => r.id === checkId);
  if (idx === -1) return null;

  let result = scan.results[idx];
  if (patch.overrideStatus !== undefined) result = setOverride(result, patch.overrideStatus);
  if (patch.comment) result = addComment(result, patch.comment);
  scan.results[idx] = result;
  return result;
}
