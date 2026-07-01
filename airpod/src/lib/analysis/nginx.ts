// nginx 설정 정적 분석 (method R: 실행 컨테이너에서 `nginx -T`로 병합된 설정을 읽어 분석).
// KISA 웹서비스 항목(W)을 nginx 설정 지시어에 합리적으로 매핑한다.
export interface NginxFacts {
  present: boolean;
  autoindexOn: boolean; // W-01 디렉토리 리스팅
  hasAccessLog: boolean; // W-08 로그
  accessLogDisabled: boolean; // access_log off 만 있는 경우
  hasErrorPage: boolean; // W-09 에러 메시지 통제
  userDirective: string | null; // W-21 데몬 실행 권한
  serverTokensOff: boolean; // W-26 헤더 정보 노출
  hasMethodRestriction: boolean; // W-25 limit_except 등
  riskyDavMethods: boolean; // W-25 dav_methods로 PUT/DELETE 등 허용
}

// 주석(#…)을 제거한 뒤 지시어를 검사한다. nginx -T 출력은 파일 경계 주석(# configuration file …)을 포함하므로 특히 필요.
function stripComments(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => {
      const i = l.indexOf("#");
      return i >= 0 ? l.slice(0, i) : l;
    })
    .join("\n");
}

export function analyzeNginx(configText: string | null): NginxFacts {
  const empty: NginxFacts = {
    present: false, autoindexOn: false, hasAccessLog: false, accessLogDisabled: false,
    hasErrorPage: false, userDirective: null, serverTokensOff: false,
    hasMethodRestriction: false, riskyDavMethods: false,
  };
  if (configText == null || configText.trim() === "") return empty;

  // 지시어는 중괄호와 같은 줄에 올 수 있으므로 줄 시작이 아니라 토큰 경계(\b)로 매칭한다.
  const cfg = stripComments(configText);

  const userMatch = cfg.match(/\buser\s+([^\s;]+)\s*;/);

  const accessLogDirectives = [...cfg.matchAll(/\baccess_log\s+([^\s;]+)/g)].map((m) => m[1]);
  const hasAccessLog = accessLogDirectives.some((v) => v.toLowerCase() !== "off");
  const accessLogDisabled = accessLogDirectives.length > 0 && accessLogDirectives.every((v) => v.toLowerCase() === "off");

  return {
    present: true,
    autoindexOn: /\bautoindex\s+on\b/.test(cfg),
    hasAccessLog,
    accessLogDisabled,
    hasErrorPage: /\berror_page\s+/.test(cfg),
    userDirective: userMatch ? userMatch[1] : null,
    serverTokensOff: /\bserver_tokens\s+off\b/.test(cfg),
    hasMethodRestriction: /\blimit_except\b/.test(cfg) || /\$request_method/.test(cfg),
    riskyDavMethods: /\bdav_methods\s+[^;]*\b(PUT|DELETE|MKCOL|COPY|MOVE)\b/i.test(cfg),
  };
}
