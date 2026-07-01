import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, sanitizeObject } from "../src/lib/analysis/sanitize";

const MASK = "«REDACTED»";

test("classic GitHub PAT (ghp_) is masked", () => {
  const tok = "ghp_FAKE0123456789abcdefghijklmnopqrst";
  const { text, redactions } = sanitize(`token is ${tok} here`);
  assert.ok(!text.includes(tok), "raw token must not survive");
  assert.ok(text.includes(MASK));
  assert.ok(redactions.some((r) => r.name === "github_pat"));
});

test("fine-grained PAT (github_pat_) is masked", () => {
  const tok = "github_pat_11ABC_" + "x".repeat(40);
  const { text } = sanitize(tok);
  assert.ok(!text.includes(tok));
});

test("credentials in repo URL are masked, scheme/host preserved", () => {
  const { text } = sanitize("clone https://alice:ghp_secretsecretsecret12@github.com/x.git");
  assert.ok(!text.includes("ghp_secretsecretsecret12"));
  assert.ok(text.includes("https://"));
  assert.ok(text.includes("@github.com/x.git"));
});

test("key=value secret keeps key, masks value", () => {
  const { text } = sanitize("DB_PASSWORD=hunter2hunter2");
  assert.match(text, /PASSWORD=«REDACTED»/i);
  assert.ok(!text.includes("hunter2hunter2"));
});

test("Authorization header value is masked", () => {
  const { text } = sanitize("Authorization: Bearer abc.def.ghi_TOKEN123");
  assert.ok(!text.includes("abc.def.ghi_TOKEN123"));
});

test("private key block is masked", () => {
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nAAAABBBBCCCC\n-----END RSA PRIVATE KEY-----";
  const { text } = sanitize(pem);
  assert.ok(!text.includes("AAAABBBBCCCC"));
});

test("AWS access key id is masked", () => {
  const { text } = sanitize("key AKIAIOSFODNN7EXAMPLE end");
  assert.ok(!text.includes("AKIAIOSFODNN7EXAMPLE"));
});

test("benign text is left unchanged", () => {
  const input = "USER app / 실행 UID: 1000 / EXPOSE 8080";
  const { text, redactions } = sanitize(input);
  assert.equal(text, input);
  assert.equal(redactions.length, 0);
});

test("sanitizeObject masks nested values and round-trips JSON", () => {
  const { value } = sanitizeObject({ note: "token=ghp_FAKE0123456789abcdefghijklmnop", ok: 1 });
  assert.equal(value.ok, 1);
  assert.ok(!JSON.stringify(value).includes("ghp_FAKE0123456789abcdefghijklmnop"));
});
