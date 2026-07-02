import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeApache } from "../src/lib/analysis/apache";

test("null/empty config → present=false", () => {
  assert.equal(analyzeApache(null).present, false);
  assert.equal(analyzeApache("   ").present, false);
});

test("Options Indexes vs -Indexes (W-01)", () => {
  assert.equal(analyzeApache("Options Indexes FollowSymLinks").indexesOn, true);
  assert.equal(analyzeApache("Options -Indexes FollowSymLinks").indexesOn, false);
  assert.equal(analyzeApache("Options FollowSymLinks").indexesOn, false);
});

test("CustomLog and ErrorDocument (W-08 / W-09)", () => {
  assert.equal(analyzeApache("CustomLog /var/log/apache2/access.log combined").hasCustomLog, true);
  assert.equal(analyzeApache("ErrorDocument 404 /404.html").hasErrorDocument, true);
  assert.equal(analyzeApache("ServerName x").hasCustomLog, false);
});

test("User directive is captured but UserDir is not mistaken for it (W-21)", () => {
  assert.equal(analyzeApache("User www-data").userDirective, "www-data");
  assert.equal(analyzeApache("User root").userDirective, "root");
  assert.equal(analyzeApache("UserDir disabled").userDirective, null);
});

test("ServerTokens / ServerSignature (W-26)", () => {
  const hardened = analyzeApache("ServerTokens Prod\nServerSignature Off");
  assert.equal(hardened.serverTokensProd, true);
  assert.equal(hardened.serverSignatureOff, true);
  assert.equal(analyzeApache("ServerTokens Full").serverTokensProd, false);
});

test("TraceEnable and Limit (W-25)", () => {
  assert.equal(analyzeApache("TraceEnable On").traceEnabledOn, true);
  assert.equal(analyzeApache("TraceEnable Off").hasLimit, true);
  assert.equal(analyzeApache("<LimitExcept GET POST>\nRequire all denied\n</LimitExcept>").hasLimit, true);
});

test("commented-out directives are ignored", () => {
  const f = analyzeApache("# Options Indexes\n# User root\nServerName x");
  assert.equal(f.indexesOn, false);
  assert.equal(f.userDirective, null);
});
