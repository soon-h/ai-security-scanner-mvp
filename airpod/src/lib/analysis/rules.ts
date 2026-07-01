import type { RawCheck, CheckResult, CheckStatus } from "../types";
import { getCatalogItem } from "../catalog";

// 가이드 기반 룰 평가 (guide_rule_evaluation).
// RawCheck evidence만 보고 status를 산출한다. Claude는 이 결과를 바꾸지 않는다 (spec §6).
// 원칙: 명확한 evidence가 있으면 review보다 pass/fail 우선, 대상 부재는 skip.

export function evaluate(raw: RawCheck): CheckResult {
  const item = getCatalogItem(raw.id);
  const status = evaluateStatus(raw);
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    severity: item.severity,
    method: item.method,
    status,
    source: raw.source,
    evidence: raw.evidence,
    claude: null,
  };
}

export function evaluateAll(raws: RawCheck[]): CheckResult[] {
  return raws.map(evaluate);
}

function evaluateStatus(raw: RawCheck): CheckStatus {
  const d = raw.data ?? {};
  switch (raw.id) {
    case "C-01": {
      const userDirective = (d.userDirective as string | null) ?? null;
      const runtimeUid = (d.runtimeUid as number | null) ?? null;
      const userIsRoot = userDirective === null || userDirective === "root" || userDirective === "0";
      if (runtimeUid === 0) return "fail"; // 실행 UID=0
      if (userIsRoot) return "fail"; // USER 미지정 or root
      // USER가 non-root이고 실행 UID도 0이 아니거나 확인 불가 → 양호
      return "pass";
    }
    case "C-02": {
      if (d.present === false) return "skip"; // Dockerfile 없음
      const hitCount = (d.hitCount as number) ?? 0;
      return hitCount > 0 ? "fail" : "pass";
    }
    case "U-16": {
      if (d.present === false) return "skip"; // /etc/passwd 없음 또는 미실행
      const owner = (d.owner as string) ?? "";
      const mode = parseInt((d.mode as string) ?? "0", 8);
      const ownerOk = owner === "root";
      // 그룹/기타 쓰기 권한이 없어야 하고 644 이하여야 함
      const groupOrOtherWritable = (mode & 0o022) !== 0;
      const permOk = !groupOrOtherWritable && mode <= 0o644;
      return ownerOk && permOk ? "pass" : "fail";
    }
    default:
      return "review";
  }
}
