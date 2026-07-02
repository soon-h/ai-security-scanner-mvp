import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthenticatedUrl } from "../src/lib/pipeline/repo";

test("buildAuthenticatedUrl: no pat → returns url unchanged", () => {
  assert.equal(buildAuthenticatedUrl("https://github.com/owner/repo"), "https://github.com/owner/repo");
});

test("buildAuthenticatedUrl: https + pat → embeds x-access-token credential", () => {
  const url = buildAuthenticatedUrl("https://github.com/owner/repo", "ghp_secret123");
  assert.ok(url.startsWith("https://x-access-token:ghp_secret123@github.com/"), url);
});

test("buildAuthenticatedUrl: ssh url + pat → left unchanged (pat not applicable)", () => {
  const url = "git@github.com:owner/repo.git";
  assert.equal(buildAuthenticatedUrl(url, "ghp_secret123"), url);
});
