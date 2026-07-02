// 점검 결과 상태값 (spec §4). 내부 status와 UI 표시값은 분리한다.
export type CheckStatus = "pass" | "fail" | "review" | "skip" | "not_automated";

export type Severity = "Critical" | "High" | "Medium" | "Low";

// 점검 방법: D=Dockerfile 정적 분석, R=실행 컨테이너
export type CheckMethod = "D" | "R" | "D+R";

export type CheckCategory = "container_hardening" | "unix" | "web";

// 정적 카탈로그 항목 정의 (spec §5)
export interface CatalogItem {
  id: string; // e.g. "C-01"
  category: CheckCategory;
  title: string;
  severity: Severity;
  method: CheckMethod;
  failCriterion: string;
}

// evidence 출처. stub 여부를 명시해 "실제 런타임 점검"과 "시뮬레이션"을 구분한다.
export type EvidenceSource = "static" | "docker" | "stub";

// 룰 평가 이전의 원시 점검 산출물 (Ansible evidence에 해당)
export interface RawCheck {
  id: string;
  source: EvidenceSource;
  evidence: string;
  // 룰 평가에 쓰이는 구조화 데이터 (예: { runtimeUid: 0 })
  data?: Record<string, unknown>;
}

// 점검 항목의 최종 판정 결과. status는 Claude가 evidence 기반으로 직접 판정한 값이며
// (AI 실패/키 부재 시 결정론적 폴백), skip만은 항상 결정론적으로 결정된다.
export interface CheckResult {
  id: string;
  category: CheckCategory;
  title: string;
  severity: Severity;
  method: CheckMethod;
  status: CheckStatus;
  source: EvidenceSource;
  evidence: string;
  // skip이 아닌 모든 항목에 채워진다 (판정 근거 + 설명). AI 실패와 점검 실패는 분리한다.
  claude?: ClaudeReport | null;
}

// Claude 출력 스키마 (spec §6)
export interface ClaudeReport {
  id: string;
  status: CheckStatus;
  severity: Severity;
  title: string;
  evidence: string;
  reason: string;
  remediation: string;
  example: string;
  // 실제 Claude 호출인지, 키 부재/실패로 인한 stub인지 표시
  generatedBy: "claude" | "stub";
}

export type StageId =
  | "clone"
  | "build"
  | "sandbox"
  | "ansible"
  | "claude"
  | "done";

export type StageStatus = "pending" | "running" | "ok" | "failed" | "skipped";

export interface StageState {
  id: StageId;
  label: string;
  status: StageStatus;
  detail?: string;
  startedAt?: string;
  endedAt?: string;
}

export type ScanStatus = "running" | "completed" | "failed";

export interface ScanRecord {
  id: string;
  repoUrl: string;
  // PAT는 여기 포함되지 않는다 — clone 1회 호출에만 쓰이고 저장되지 않는다 (spec story 3/4).
  branch: string;
  createdAt: string;
  updatedAt: string;
  status: ScanStatus;
  // executor 및 fallback 상황 표시
  executor: "docker" | "stub";
  usedLocalImageFallback: boolean;
  imageRef?: string;
  commitSha?: string; // 빌드에 쓰인 실제 커밋 (clone 성공 시에만 채워짐)
  candidatePath?: string; // 사용자가 후보 목록에서 고른 Dockerfile 경로 (미선택/자동감지 시 없음)
  stages: StageState[];
  results: CheckResult[];
  error?: string;
}

export interface ScanSummary {
  fail: number;
  pass: number;
  review: number;
  skip: number;
  not_automated: number;
}

export function summarize(results: CheckResult[]): ScanSummary {
  const s: ScanSummary = { fail: 0, pass: 0, review: 0, skip: 0, not_automated: 0 };
  for (const r of results) s[r.status] += 1;
  return s;
}

// 내부 status → UI 표시값 (spec §4). "KISA 판정" 표현은 쓰지 않는다.
export const STATUS_LABEL_KO: Record<CheckStatus, string> = {
  pass: "양호",
  fail: "취약",
  review: "검토",
  skip: "제외/해당 없음",
  not_automated: "자동화 전",
};
