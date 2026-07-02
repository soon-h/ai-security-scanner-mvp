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

// 담당자가 직접 지정할 수 있는 판정 (skip/not_automated로는 override하지 않는다 — 그건 evidence의
// 사실이지 보안 판단이 아니다).
export type OverridableStatus = "pass" | "fail" | "review";

export interface CheckOverride {
  status: OverridableStatus;
  updatedAt: string;
}

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
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
  // 담당자가 status를 조정한 경우에만 존재 — status/claude는 그대로 두고 이 위에 얹는다
  // (AI/폴백이 원래 뭐라고 했는지 항상 감사 가능하게 남긴다). 화면 표시는 effectiveStatus() 사용.
  override?: CheckOverride | null;
  comments?: Comment[];
}

// override가 있으면 그걸, 없으면 원 판정을 유효 판정으로 취급한다.
export function effectiveStatus(r: CheckResult): CheckStatus {
  return r.override?.status ?? r.status;
}

// Claude 출력 스키마 (spec §6). situation(현재상황)/reason(클로드 분석)/remediation(조치방안,
// pass면 빈 문자열)로 역할을 나눈다.
export interface ClaudeReport {
  id: string;
  status: CheckStatus;
  severity: Severity;
  title: string;
  evidence: string;
  situation: string;
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
  for (const r of results) s[effectiveStatus(r)] += 1;
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
