import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRepoUrl, validateBranch, validatePat, validateCandidatePath, validateScanInput } from "../src/lib/validate";

test("validateRepoUrl: accepts https/http/git@, rejects empty/whitespace/other schemes", () => {
  assert.equal(validateRepoUrl("https://github.com/owner/repo"), null);
  assert.equal(validateRepoUrl("http://internal.git/owner/repo"), null);
  assert.equal(validateRepoUrl("git@github.com:owner/repo.git"), null);
  assert.ok(validateRepoUrl(""));
  assert.ok(validateRepoUrl("   "));
  assert.ok(validateRepoUrl("https://github.com/owner/repo with space"));
  assert.ok(validateRepoUrl("ftp://github.com/owner/repo"));
});

test("validateRepoUrl: also accepts local filesystem paths (offline/fixture scans)", () => {
  assert.equal(validateRepoUrl("C:/Users/dev/repo-fixture"), null);
  assert.equal(validateRepoUrl("C:\\Users\\dev\\repo-fixture"), null);
  assert.equal(validateRepoUrl("/home/dev/repo-fixture"), null);
  assert.equal(validateRepoUrl("./repo-fixture"), null);
});

test("validateBranch: empty is valid (defaults later), rejects whitespace/.. /bad chars", () => {
  assert.equal(validateBranch(""), null);
  assert.equal(validateBranch("main"), null);
  assert.equal(validateBranch("feature/foo-bar.1"), null);
  assert.ok(validateBranch("feature branch"));
  assert.ok(validateBranch("../etc"));
  assert.ok(validateBranch("bad;branch"));
});

test("validatePat: only usable with https/http repo URLs, rejects whitespace/oversized", () => {
  assert.equal(validatePat(undefined, "https://github.com/owner/repo"), null);
  assert.equal(validatePat("ghp_abc123", "https://github.com/owner/repo"), null);
  assert.ok(validatePat("ghp_abc123", "git@github.com:owner/repo.git"));
  assert.ok(validatePat("token with space", "https://github.com/owner/repo"));
  assert.ok(validatePat("a".repeat(300), "https://github.com/owner/repo"));
});

test("validateCandidatePath: accepts relative paths, rejects .. / absolute / backslash", () => {
  assert.equal(validateCandidatePath(undefined), null);
  assert.equal(validateCandidatePath("Dockerfile"), null);
  assert.equal(validateCandidatePath("nginx/Dockerfile"), null);
  assert.ok(validateCandidatePath("../etc/Dockerfile"));
  assert.ok(validateCandidatePath("/etc/Dockerfile"));
  assert.ok(validateCandidatePath("C:\\Windows\\Dockerfile"));
  assert.ok(validateCandidatePath("nginx\\Dockerfile"));
});

test("validateScanInput: applies default branch and passes pat through only on success", () => {
  const ok = validateScanInput({ repoUrl: "https://github.com/owner/repo", branch: "", pat: "secret" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.branch, "main");
    assert.equal(ok.pat, "secret");
    assert.equal(ok.repoUrl, "https://github.com/owner/repo");
  }
});

test("validateScanInput: rejects invalid repoUrl before checking branch/pat", () => {
  const bad = validateScanInput({ repoUrl: "", branch: "main" });
  assert.equal(bad.ok, false);
});

test("validateScanInput: rejects pat on ssh repo url", () => {
  const bad = validateScanInput({ repoUrl: "git@github.com:owner/repo.git", pat: "secret" });
  assert.equal(bad.ok, false);
});

test("validateScanInput: rejects a path-traversal candidatePath", () => {
  const bad = validateScanInput({ repoUrl: "https://github.com/owner/repo", candidatePath: "../../etc/passwd" });
  assert.equal(bad.ok, false);
});
