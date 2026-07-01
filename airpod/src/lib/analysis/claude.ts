import type { CheckResult, ClaudeReport } from "../types";
import { sanitize } from "./sanitize";

// Claude API 분석 (spec §6).
// Claude는 기준을 만들거나 룰 평가 결과(status)를 바꾸지 않는다. 이미 산출된 evidence/status를
// 사람이 이해하기 쉬운 설명(reason/remediation/example)으로 바꾸는 역할만 한다.
// AI 실패는 점검 실패와 분리한다 — 키가 없거나 호출이 실패하면 stub 리포트로 대체한다.

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

// 구조화 출력 강제: tool_use로 스키마를 고정한다 (spec: JSON schema 검증).
const REPORT_TOOL = {
  name: "emit_report",
  description: "점검 항목에 대한 사람이 읽기 좋은 보안 리포트를 구조화해 반환한다.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "왜 위험한지(또는 왜 양호한지) 설명" },
      remediation: { type: "string", description: "구체적 조치 방안" },
      example: { type: "string", description: "설정/코드 예시" },
    },
    required: ["reason", "remediation", "example"],
  },
} as const;

export async function analyzeResults(results: CheckResult[]): Promise<CheckResult[]> {
  // fail/review 항목만 Claude 설명 대상 (spec §3 F4)
  const out: CheckResult[] = [];
  for (const r of results) {
    if (r.status === "fail" || r.status === "review") {
      r.claude = await analyzeOne(r);
    }
    out.push(r);
  }
  return out;
}

async function analyzeOne(r: CheckResult): Promise<ClaudeReport> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  // Claude 입력은 반드시 sanitize한다.
  const safeEvidence = sanitize(r.evidence).text;

  if (!apiKey) {
    return stubReport(r, safeEvidence, "ANTHROPIC_API_KEY 미설정 — Claude 분석을 stub로 대체");
  }

  const system =
    "너는 컨테이너 보안 점검 리포트를 작성하는 도우미다. " +
    "이미 산출된 점검 status(pass/fail/review)와 evidence는 절대 바꾸지 마라. " +
    "새 보안 기준을 만들지 말고, 주어진 evidence를 해석해 위험 이유·조치방안·설정 예시만 제시하라. " +
    "반드시 emit_report 도구로만 답하라.";

  const userPayload = sanitize(
    JSON.stringify({
      id: r.id,
      title: r.title,
      status: r.status,
      severity: r.severity,
      evidence: safeEvidence,
      failCriterion: r.method,
    }),
  ).text;

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        tools: [REPORT_TOOL],
        tool_choice: { type: "tool", name: "emit_report" },
        messages: [{ role: "user", content: `다음 점검 결과를 설명하라:\n${userPayload}` }],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return stubReport(r, safeEvidence, `Claude API 오류 ${resp.status}: ${body.slice(0, 200)}`);
    }

    const json = (await resp.json()) as {
      content: { type: string; name?: string; input?: Record<string, string> }[];
    };
    const toolUse = json.content.find((c) => c.type === "tool_use" && c.name === "emit_report");
    const input = toolUse?.input;
    if (!input?.reason) {
      return stubReport(r, safeEvidence, "Claude 응답에 유효한 리포트 없음");
    }

    // status/severity/title/evidence는 룰 평가 결과를 그대로 유지한다(Claude가 못 바꾸게).
    return {
      id: r.id,
      status: r.status,
      severity: r.severity,
      title: r.title,
      evidence: safeEvidence,
      reason: input.reason,
      remediation: input.remediation ?? "",
      example: input.example ?? "",
      generatedBy: "claude",
    };
  } catch (err) {
    return stubReport(r, safeEvidence, `Claude 호출 실패: ${(err as Error).message}`);
  }
}

// 키 부재/실패 시 사용하는 결정적 stub 리포트. 항목별 기본 설명을 제공한다.
function stubReport(r: CheckResult, safeEvidence: string, note: string): ClaudeReport {
  const canned: Record<string, { reason: string; remediation: string; example: string }> = {
    "C-01": {
      reason: "root 권한으로 실행되는 컨테이너는 침해 시 호스트 자원 접근 위험을 키운다.",
      remediation: "Dockerfile에 non-root 사용자를 생성하고 USER 지시어로 전환한다.",
      example: "RUN useradd -r appuser\nUSER appuser",
    },
    "C-02": {
      reason: "이미지 레이어에 하드코딩된 시크릿은 이미지를 가진 누구나 추출할 수 있다.",
      remediation: "빌드 시 시크릿을 ENV/ARG로 넣지 말고 런타임 시크릿 주입(예: docker secret, 환경변수 주입)으로 옮긴다.",
      example: "# 잘못된 예: ENV API_KEY=abcd1234\n# 권장: 런타임에 -e API_KEY=... 또는 시크릿 매니저 사용",
    },
    "C-03": {
      reason: "SSH·DB 등 관리 포트가 노출되면 공격 표면이 커지고 측면 이동·직접 접근 위험이 있다.",
      remediation: "불필요한 EXPOSE를 제거하고, 관리·DB 포트는 내부 네트워크로만 접근하도록 제한한다.",
      example: "# EXPOSE 22 3306  ← 제거\nEXPOSE 8080",
    },
    "C-04": {
      reason: ":latest 또는 태그 미고정은 빌드 재현성을 해치고 예기치 않은 취약 이미지 유입 위험이 있다.",
      remediation: "명시적 버전 태그 또는 digest(@sha256:...)로 base 이미지를 고정한다.",
      example: "FROM ubuntu:24.04\n# 또는 FROM ubuntu@sha256:<digest>",
    },
    "C-05": {
      reason: "curl/wget/gcc/apt 등 빌드·네트워크 도구가 상주하면 침해 시 페이로드 다운로드·컴파일에 악용될 수 있다.",
      remediation: "multi-stage build로 런타임 이미지에서 빌드 도구를 제거하거나 설치 후 정리한다.",
      example: "RUN apt-get purge -y gcc curl wget && rm -rf /var/lib/apt/lists/*",
    },
    "C-06": {
      reason: "예상 외 setuid/setgid 바이너리는 권한 상승 경로가 될 수 있다.",
      remediation: "불필요한 setuid/setgid 비트를 제거한다.",
      example: "chmod u-s /path/to/binary",
    },
    "C-07": {
      reason: "루트 파일시스템이 쓰기 가능하면 침해 시 바이너리·설정 변조가 쉬워진다.",
      remediation: "컨테이너를 --read-only 로 실행하고 쓰기가 필요한 경로만 tmpfs/volume으로 분리한다.",
      example: "docker run --read-only --tmpfs /tmp ...",
    },
    "C-08": {
      reason: "HEALTHCHECK가 없으면 컨테이너 이상 상태를 오케스트레이터가 감지하지 못해 장애 대응이 늦어진다.",
      remediation: "HEALTHCHECK 지시어로 상태 점검 명령을 정의한다.",
      example: "HEALTHCHECK --interval=30s CMD curl -f http://localhost:8080/health || exit 1",
    },
    "C-09": {
      reason: "원격 URL ADD는 무결성 검증 없이 외부 콘텐츠를 이미지에 포함시켜 공급망 위험을 만든다.",
      remediation: "로컬 파일은 COPY를 쓰고, 원격 리소스는 검증 가능한 방식으로 별도 단계에서 받는다.",
      example: "COPY app /app\n# ADD https://... 대신 검증된 다운로드 사용",
    },
    "U-16": {
      reason: "/etc/passwd 가 과도한 권한이면 계정 정보 변조·권한 상승 위험이 있다.",
      remediation: "소유자를 root:root 로, 권한을 644 이하로 설정한다.",
      example: "chown root:root /etc/passwd\nchmod 644 /etc/passwd",
    },
  };
  const base = canned[r.id] ?? {
    reason: "evidence 기반으로 추가 검토가 필요하다.",
    remediation: "가이드 기준에 맞게 설정을 조정한다.",
    example: "",
  };
  return {
    id: r.id,
    status: r.status,
    severity: r.severity,
    title: r.title,
    evidence: safeEvidence,
    reason: `${base.reason}\n\n(참고: ${note})`,
    remediation: base.remediation,
    example: base.example,
    generatedBy: "stub",
  };
}
