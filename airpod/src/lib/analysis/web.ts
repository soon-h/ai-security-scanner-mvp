import type { WebServerInfo } from "../executor/types";
import { analyzeNginx } from "./nginx";
import { analyzeApache } from "./apache";

// 서버 중립 웹 설정 판정 사실. nginx/apache 각 파서 결과를 공통 W 항목 신호로 정규화한다.
// 이렇게 하면 W 항목 evidence/룰 평가가 특정 웹서버에 종속되지 않는다.
export interface WebFacts {
  present: boolean;
  server: "nginx" | "apache" | null;
  directoryListingOn: boolean; // W-01 (true=취약)
  hasAccessLog: boolean; // W-08 (true=양호)
  hasCustomErrorPage: boolean; // W-09 (true=양호)
  runsAsRoot: boolean; // W-21 (true=취약)
  userValue: string | null; // W-21 evidence용
  versionExposed: boolean; // W-26 (true=취약)
  riskyMethods: boolean; // W-25 (true=취약)
  methodRestricted: boolean; // W-25 (true=양호, 아니면 review)
}

const EMPTY: WebFacts = {
  present: false, server: null, directoryListingOn: false, hasAccessLog: false,
  hasCustomErrorPage: false, runsAsRoot: false, userValue: null,
  versionExposed: false, riskyMethods: false, methodRestricted: false,
};

export function analyzeWeb(web: WebServerInfo | null): WebFacts {
  if (!web) return EMPTY;

  if (web.kind === "nginx") {
    const n = analyzeNginx(web.configText);
    if (!n.present) return EMPTY;
    return {
      present: true, server: "nginx",
      directoryListingOn: n.autoindexOn,
      hasAccessLog: n.hasAccessLog,
      hasCustomErrorPage: n.hasErrorPage,
      runsAsRoot: n.userDirective === "root",
      userValue: n.userDirective,
      versionExposed: !n.serverTokensOff,
      riskyMethods: n.riskyDavMethods,
      methodRestricted: n.hasMethodRestriction,
    };
  }

  const a = analyzeApache(web.configText);
  if (!a.present) return EMPTY;
  return {
    present: true, server: "apache",
    directoryListingOn: a.indexesOn,
    hasAccessLog: a.hasCustomLog,
    hasCustomErrorPage: a.hasErrorDocument,
    runsAsRoot: a.userDirective === "root",
    userValue: a.userDirective,
    // Apache는 ServerTokens Prod + ServerSignature Off 둘 다여야 버전 은닉
    versionExposed: !(a.serverTokensProd && a.serverSignatureOff),
    riskyMethods: a.traceEnabledOn,
    methodRestricted: a.hasLimit,
  };
}
