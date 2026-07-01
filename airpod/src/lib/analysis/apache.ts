// Apache httpd 설정 정적 분석 (method R). nginx.ts와 대칭. 같은 KISA W 항목을 Apache 지시어에 매핑한다.
export interface ApacheFacts {
  present: boolean;
  indexesOn: boolean; // W-01: Options에 Indexes(-Indexes 아님)
  hasCustomLog: boolean; // W-08: CustomLog/TransferLog
  hasErrorDocument: boolean; // W-09: ErrorDocument
  userDirective: string | null; // W-21: User
  serverTokensProd: boolean; // W-26: ServerTokens Prod/ProductOnly
  serverSignatureOff: boolean; // W-26: ServerSignature Off
  traceEnabledOn: boolean; // W-25: TraceEnable On (위험)
  hasLimit: boolean; // W-25: <Limit>/<LimitExcept> 또는 TraceEnable Off
}

function stripComments(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => {
      const i = l.indexOf("#");
      return i >= 0 ? l.slice(0, i) : l;
    })
    .join("\n");
}

export function analyzeApache(configText: string | null): ApacheFacts {
  const empty: ApacheFacts = {
    present: false, indexesOn: false, hasCustomLog: false, hasErrorDocument: false,
    userDirective: null, serverTokensProd: false, serverSignatureOff: false,
    traceEnabledOn: false, hasLimit: false,
  };
  if (configText == null || configText.trim() === "") return empty;

  const cfg = stripComments(configText);

  // Options 라인 중 -Indexes가 아닌 Indexes가 있으면 디렉토리 리스팅 활성
  const indexesOn = cfg
    .split(/\r?\n/)
    .filter((l) => /\bOptions\b/i.test(l))
    .some((l) => /(?<!-)\bIndexes\b/i.test(l));

  const userMatch = cfg.match(/\bUser\s+([^\s]+)/);
  const traceOff = /\bTraceEnable\s+Off\b/i.test(cfg);

  return {
    present: true,
    indexesOn,
    hasCustomLog: /\b(CustomLog|TransferLog)\b/i.test(cfg),
    hasErrorDocument: /\bErrorDocument\b/i.test(cfg),
    userDirective: userMatch ? userMatch[1] : null,
    serverTokensProd: /\bServerTokens\s+(Prod|ProductOnly)\b/i.test(cfg),
    serverSignatureOff: /\bServerSignature\s+Off\b/i.test(cfg),
    traceEnabledOn: /\bTraceEnable\s+On\b/i.test(cfg),
    hasLimit: /<Limit(Except)?\b/i.test(cfg) || traceOff,
  };
}
