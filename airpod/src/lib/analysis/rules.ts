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
      // 런타임 UID를 관찰했으면 그것이 ground truth (USER 지시어보다 우선).
      if (runtimeUid !== null) return runtimeUid === 0 ? "fail" : "pass";
      // 런타임 미관찰 → 정적 USER 지시어로 판정 (미지정/root → fail)
      const userIsRoot = userDirective === null || userDirective === "root" || userDirective === "0";
      return userIsRoot ? "fail" : "pass";
    }
    case "C-02": {
      if (d.present === false) return "skip"; // Dockerfile 없음
      const hitCount = (d.hitCount as number) ?? 0;
      return hitCount > 0 ? "fail" : "pass";
    }
    case "C-03": {
      if (d.present === false && !d.listeningObserved) return "skip";
      const exposedSensitive = (d.exposedSensitive as number[]) ?? [];
      const listeningSensitive = (d.listeningSensitive as number[]) ?? [];
      // D 또는 R에서 민감 포트가 확인되면 fail
      if (exposedSensitive.length > 0 || listeningSensitive.length > 0) return "fail";
      // EXPOSE는 깨끗하지만 런타임 관찰을 못 한 경우에도 D 근거로 pass (명확한 evidence 우선)
      return "pass";
    }
    case "C-04": {
      if (d.present === false) return "skip";
      if (d.baseDigestPinned) return "pass";
      const tag = (d.baseTag as string | null) ?? null;
      if (tag === null || tag === "latest") return "fail"; // 태그 없음 or :latest
      return "pass";
    }
    case "C-05": {
      if (d.observed === false) return "review"; // Docker 없이 관찰 불가
      const packages = (d.packages as string[]) ?? [];
      return packages.length > 0 ? "fail" : "pass";
    }
    case "C-06": {
      if (d.observed === false) return "review";
      const unexpected = (d.unexpected as string[]) ?? [];
      return unexpected.length > 0 ? "fail" : "pass";
    }
    case "C-07": {
      if (d.observed === false) return "review";
      return d.writable ? "fail" : "pass";
    }
    case "C-08": {
      if (d.present === false) return "skip";
      return d.hasHealthcheck ? "pass" : "fail";
    }
    case "C-09": {
      if (d.present === false) return "skip";
      const hitCount = (d.hitCount as number) ?? 0;
      return hitCount > 0 ? "fail" : "pass";
    }
    case "U-04": {
      if (d.observed === false) return "review"; // /etc/passwd 읽기 불가
      const exposed = (d.exposed as string[]) ?? [];
      return exposed.length > 0 ? "fail" : "pass";
    }
    case "U-05": {
      if (d.observed === false) return "review";
      const uid0 = (d.uid0 as string[]) ?? [];
      return uid0.length > 0 ? "fail" : "pass";
    }
    // U-16/19/22: root 소유 + 그룹/기타 쓰기 없음 + 644 이하
    case "U-16":
    case "U-19":
    case "U-22": {
      if (d.present === false) return "skip";
      const owner = (d.owner as string) ?? "";
      const mode = parseInt((d.mode as string) ?? "0", 8);
      const ownerOk = owner === "root";
      const groupOrOtherWritable = (mode & 0o022) !== 0;
      const permOk = !groupOrOtherWritable && mode <= 0o644;
      return ownerOk && permOk ? "pass" : "fail";
    }
    case "U-18": {
      // /etc/shadow는 더 엄격: root 소유 + 그룹 쓰기 없음 + others 어떤 권한도 없음 (640/600/400/000 허용)
      if (d.present === false) return "skip";
      const owner = (d.owner as string) ?? "";
      const mode = parseInt((d.mode as string) ?? "0", 8);
      const ownerOk = owner === "root";
      const bad = (mode & 0o020) !== 0 || (mode & 0o007) !== 0;
      return ownerOk && !bad ? "pass" : "fail";
    }
    case "U-25": {
      if (d.observed === false) return "review";
      const count = (d.count as number) ?? 0;
      return count > 0 ? "fail" : "pass";
    }
    // 웹 항목: 웹서버 미탐지(present=false) → skip (해당 없음). nginx/apache 공통(정규화된 WebFacts).
    case "W-01":
      if (d.present === false) return "skip";
      return d.directoryListingOn ? "fail" : "pass";
    case "W-08":
      if (d.present === false) return "skip";
      return d.hasAccessLog ? "pass" : "fail";
    case "W-09":
      if (d.present === false) return "skip";
      return d.hasCustomErrorPage ? "pass" : "fail";
    case "W-21":
      if (d.present === false) return "skip";
      return d.runsAsRoot ? "fail" : "pass";
    case "W-22": {
      if (d.present === false) return "skip";
      const owner = (d.owner as string) ?? "";
      const mode = parseInt((d.mode as string) ?? "0", 8);
      const groupOrOtherWritable = (mode & 0o022) !== 0;
      return owner === "root" && !groupOrOtherWritable ? "pass" : "fail";
    }
    case "W-25":
      if (d.present === false) return "skip";
      if (d.riskyMethods) return "fail"; // 위험 메서드 명시적 허용
      if (d.methodRestricted) return "pass"; // 메서드 제한 설정 존재
      return "review"; // 명시적 제한 없음 — 기본값이라 단정 불가
    case "W-26":
      if (d.present === false) return "skip";
      return d.versionExposed ? "fail" : "pass";
    default:
      return "review";
  }
}
