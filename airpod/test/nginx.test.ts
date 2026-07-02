import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeNginx } from "../src/lib/analysis/nginx";

test("null/empty config → present=false", () => {
  assert.equal(analyzeNginx(null).present, false);
  assert.equal(analyzeNginx("   ").present, false);
});

test("autoindex on is detected (W-01)", () => {
  assert.equal(analyzeNginx("location / { autoindex on; }").autoindexOn, true);
  assert.equal(analyzeNginx("location / { autoindex off; }").autoindexOn, false);
});

test("access_log presence vs off (W-08)", () => {
  assert.equal(analyzeNginx("access_log /var/log/nginx/a.log;").hasAccessLog, true);
  const off = analyzeNginx("access_log off;");
  assert.equal(off.hasAccessLog, false);
  assert.equal(off.accessLogDisabled, true);
});

test("user directive and server_tokens (W-21 / W-26)", () => {
  const f = analyzeNginx("user nginx;\nhttp { server_tokens off; }");
  assert.equal(f.userDirective, "nginx");
  assert.equal(f.serverTokensOff, true);
  assert.equal(analyzeNginx("user root;").userDirective, "root");
});

test("commented-out directives are ignored", () => {
  // nginx -T 출력의 파일 경계 주석과 주석 처리된 지시어를 오탐하지 않는다
  const f = analyzeNginx("# server_tokens off;\n# autoindex on;\nuser nginx;");
  assert.equal(f.serverTokensOff, false);
  assert.equal(f.autoindexOn, false);
});

test("risky dav_methods vs limit_except (W-25)", () => {
  assert.equal(analyzeNginx("dav_methods PUT DELETE;").riskyDavMethods, true);
  assert.equal(analyzeNginx("limit_except GET POST { deny all; }").hasMethodRestriction, true);
  assert.equal(analyzeNginx("location / {}").riskyDavMethods, false);
});

test("error_page detection (W-09)", () => {
  assert.equal(analyzeNginx("error_page 404 /404.html;").hasErrorPage, true);
  assert.equal(analyzeNginx("location / {}").hasErrorPage, false);
});
