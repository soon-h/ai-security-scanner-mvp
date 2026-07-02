import { test } from "node:test";
import assert from "node:assert/strict";
import { collectEvidence } from "../src/lib/analysis/checks";
import { evaluateAll } from "../src/lib/analysis/rules";
import type { RunHandle } from "../src/lib/executor/types";
import type { CheckStatus } from "../src/lib/types";
import { FakeExecutor, vulnerableOptions, safeOptions } from "./helpers/fakes";
import { VULN_DOCKERFILE, SAFE_DOCKERFILE, VULN_APACHE, SAFE_APACHE, VULN_TOMCAT, SAFE_TOMCAT } from "./helpers/fixtures";

const HANDLE: RunHandle = { containerId: "c", imageRef: "i" };

async function statusMap(dockerfile: string | null, executor: FakeExecutor, handle: RunHandle | null) {
  const raws = await collectEvidence(dockerfile, executor, handle);
  const results = evaluateAll(raws);
  return new Map<string, CheckStatus>(results.map((r) => [r.id, r.status]));
}

test("vulnerable fixture: every check fails except the well-configured one (U-19)", async () => {
  const m = await statusMap(VULN_DOCKERFILE, new FakeExecutor(vulnerableOptions()), HANDLE);
  const shouldFail = [
    "C-01","C-02","C-03","C-04","C-05","C-06","C-07","C-08","C-09",
    "U-04","U-05","U-16","U-18","U-22","U-25",
    "W-01","W-08","W-09","W-21","W-22","W-25","W-26",
  ];
  for (const id of shouldFail) assert.equal(m.get(id), "fail", `${id} should fail`);
  assert.equal(m.get("U-19"), "pass"); // /etc/hosts 644 = 양호
});

test("safe fixture: every check passes (guards against rule fallthrough)", async () => {
  const m = await statusMap(SAFE_DOCKERFILE, new FakeExecutor(safeOptions()), HANDLE);
  for (const [id, status] of m) assert.equal(status, "pass", `${id} should pass, got ${status}`);
});

test("no runtime observation: unobservable → review/skip, never a fabricated fail", async () => {
  // 모든 런타임 관찰이 null인 fake (컨테이너는 떴지만 아무것도 못 봄) + 안전한 Dockerfile
  const m = await statusMap(SAFE_DOCKERFILE, new FakeExecutor({}), HANDLE);
  assert.ok(![...m.values()].includes("fail"), "must not invent fails without evidence");
  for (const id of ["C-05", "C-06", "C-07", "U-04", "U-05", "U-25"]) {
    assert.equal(m.get(id), "review", `${id} → review`);
  }
  for (const id of ["U-16", "U-18", "U-19", "U-22"]) {
    assert.equal(m.get(id), "skip", `${id} → skip (파일 없음)`);
  }
  // 웹서버 미탐지 → 모든 W 항목 skip
  for (const id of ["W-01", "W-08", "W-09", "W-21", "W-22", "W-25", "W-26"]) {
    assert.equal(m.get(id), "skip", `${id} → skip (웹서버 없음)`);
  }
  // 정적 근거만으로 판정 가능한 항목은 여전히 pass
  assert.equal(m.get("C-01"), "pass");
  assert.equal(m.get("C-08"), "pass");
});

test("C-01: observed runtime UID overrides the static USER directive", async () => {
  // Dockerfile 없음(지시어 null)이지만 런타임 uid=1000 관찰 → 양호 (fallback 이미지 사례)
  const nonRoot = await statusMap(null, new FakeExecutor({ runtimeUid: 1000 }), HANDLE);
  assert.equal(nonRoot.get("C-01"), "pass");
  // USER app 지시어가 있어도 런타임 uid=0이면 취약 (런타임이 ground truth)
  const rootAtRuntime = await statusMap("FROM x\nUSER app", new FakeExecutor({ runtimeUid: 0 }), HANDLE);
  assert.equal(rootAtRuntime.get("C-01"), "fail");
});

test("apache web server: same W items map to Apache config (vulnerable → fail)", async () => {
  const exec = new FakeExecutor({
    webServer: { kind: "apache", configPath: "/usr/local/apache2/conf/httpd.conf", configText: VULN_APACHE },
    fileStats: { "/usr/local/apache2/conf/httpd.conf": { path: "x", owner: "root", group: "root", mode: "666" } },
  });
  const m = await statusMap(null, exec, HANDLE);
  for (const id of ["W-01", "W-08", "W-09", "W-21", "W-22", "W-25", "W-26"]) {
    assert.equal(m.get(id), "fail", `${id} should fail on vulnerable apache`);
  }
});

test("apache web server: hardened config passes all W items", async () => {
  const exec = new FakeExecutor({
    webServer: { kind: "apache", configPath: "/usr/local/apache2/conf/httpd.conf", configText: SAFE_APACHE },
    fileStats: { "/usr/local/apache2/conf/httpd.conf": { path: "x", owner: "root", group: "root", mode: "644" } },
  });
  const m = await statusMap(null, exec, HANDLE);
  for (const id of ["W-01", "W-08", "W-09", "W-21", "W-22", "W-25", "W-26"]) {
    assert.equal(m.get(id), "pass", `${id} should pass on hardened apache`);
  }
});

test("tomcat web server: vulnerable config + root runtime UID → fail", async () => {
  const exec = new FakeExecutor({
    runtimeUid: 0, // W-21: tomcat은 config가 아니라 런타임 UID로 판단
    webServer: { kind: "tomcat", configPath: "/usr/local/tomcat/conf/server.xml", configText: VULN_TOMCAT },
    fileStats: { "/usr/local/tomcat/conf/server.xml": { path: "x", owner: "root", group: "root", mode: "666" } },
  });
  const m = await statusMap(null, exec, HANDLE);
  for (const id of ["W-01", "W-08", "W-09", "W-21", "W-22", "W-25", "W-26"]) {
    assert.equal(m.get(id), "fail", `${id} should fail on vulnerable tomcat`);
  }
});

test("tomcat web server: hardened config + non-root runtime UID passes all W items", async () => {
  const exec = new FakeExecutor({
    runtimeUid: 1000,
    webServer: { kind: "tomcat", configPath: "/usr/local/tomcat/conf/server.xml", configText: SAFE_TOMCAT },
    fileStats: { "/usr/local/tomcat/conf/server.xml": { path: "x", owner: "root", group: "root", mode: "644" } },
  });
  const m = await statusMap(null, exec, HANDLE);
  for (const id of ["W-01", "W-08", "W-09", "W-21", "W-22", "W-25", "W-26"]) {
    assert.equal(m.get(id), "pass", `${id} should pass on hardened tomcat`);
  }
});

test("tomcat web server: unobservable runtime UID → W-21 review, never a fabricated pass/fail", async () => {
  const exec = new FakeExecutor({
    runtimeUid: null,
    webServer: { kind: "tomcat", configPath: "/usr/local/tomcat/conf/server.xml", configText: SAFE_TOMCAT },
    fileStats: { "/usr/local/tomcat/conf/server.xml": { path: "x", owner: "root", group: "root", mode: "644" } },
  });
  const m = await statusMap(null, exec, HANDLE);
  assert.equal(m.get("W-21"), "review");
});

test("source is propagated from the executor into results", async () => {
  const raws = await collectEvidence(SAFE_DOCKERFILE, new FakeExecutor(safeOptions()), HANDLE);
  const c05 = raws.find((r) => r.id === "C-05");
  assert.equal(c05?.source, "docker");
});
