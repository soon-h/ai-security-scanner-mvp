// Tomcat 설정 정적 분석 (method R). configText는 server.xml + web.xml을 이어붙인 텍스트
// (executor가 두 파일을 합쳐서 넘긴다). nginx.ts/apache.ts와 대칭으로 같은 KISA W 항목을 매핑한다.
// Tomcat은 nginx/apache와 달리 프로세스 실행 계정을 지시어로 지정하지 않으므로(W-21) 여기서는
// 다루지 않는다 — web.ts가 런타임 관찰 UID로 별도 판단한다.
export interface TomcatFacts {
  present: boolean;
  listingsOn: boolean; // W-01: DefaultServlet의 listings init-param이 true
  hasAccessLogValve: boolean; // W-08: AccessLogValve
  hasErrorPage: boolean; // W-09: <error-page>
  serverAttrOverridden: boolean; // W-26: <Connector server="..."> 로 기본 배너 재정의
  readonlyExplicitFalse: boolean; // W-25: DefaultServlet readonly=false → PUT/DELETE 허용(위험)
  readonlyExplicitTrue: boolean; // W-25: readonly=true 명시
  hasSecurityConstraint: boolean; // W-25: <security-constraint> 로 메서드 제한
}

function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

export function analyzeTomcat(configText: string | null): TomcatFacts {
  const empty: TomcatFacts = {
    present: false, listingsOn: false, hasAccessLogValve: false, hasErrorPage: false,
    serverAttrOverridden: false, readonlyExplicitFalse: false, readonlyExplicitTrue: false,
    hasSecurityConstraint: false,
  };
  if (configText == null || configText.trim() === "") return empty;

  const cfg = stripComments(configText);
  const readonlyParam = cfg.match(
    /<param-name>\s*readonly\s*<\/param-name>\s*<param-value>\s*(true|false)\s*<\/param-value>/i,
  );

  return {
    present: true,
    listingsOn: /<param-name>\s*listings\s*<\/param-name>\s*<param-value>\s*true\s*<\/param-value>/i.test(cfg),
    hasAccessLogValve: /<Valve\b[^>]*className\s*=\s*"org\.apache\.catalina\.valves\.\w*AccessLogValve"/i.test(cfg),
    hasErrorPage: /<error-page>/i.test(cfg),
    serverAttrOverridden: /<Connector\b[^>]*\bserver\s*=\s*"[^"]+"/i.test(cfg),
    readonlyExplicitFalse: readonlyParam?.[1].toLowerCase() === "false",
    readonlyExplicitTrue: readonlyParam?.[1].toLowerCase() === "true",
    hasSecurityConstraint: /<security-constraint>/i.test(cfg),
  };
}
