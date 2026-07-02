import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildAuthenticatedUrl, findDockerfileCandidates, getCommitSha } from "../src/lib/pipeline/repo";

const pexec = promisify(execFile);

async function mkTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

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

test("findDockerfileCandidates: finds root + nested Dockerfiles, skips .git and node_modules", async () => {
  const dir = await mkTempDir("airpod-candidates-");
  try {
    await fs.writeFile(path.join(dir, "Dockerfile"), "FROM debian:12\n");
    await fs.mkdir(path.join(dir, "nginx"), { recursive: true });
    await fs.writeFile(path.join(dir, "nginx", "Dockerfile"), "FROM nginx:1.27\n");
    await fs.mkdir(path.join(dir, ".git"), { recursive: true });
    await fs.writeFile(path.join(dir, ".git", "Dockerfile"), "FROM should-be-ignored\n");
    await fs.mkdir(path.join(dir, "node_modules", "pkg"), { recursive: true });
    await fs.writeFile(path.join(dir, "node_modules", "pkg", "Dockerfile"), "FROM should-be-ignored\n");

    const candidates = await findDockerfileCandidates(dir);
    const byPath = new Map(candidates.map((c) => [c.path, c.baseImageGuess]));

    assert.equal(candidates.length, 2, `expected 2 candidates, got: ${JSON.stringify(candidates)}`);
    assert.equal(byPath.get("Dockerfile"), "debian:12");
    assert.equal(byPath.get("nginx/Dockerfile"), "nginx:1.27");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("findDockerfileCandidates: no Dockerfile anywhere → empty list", async () => {
  const dir = await mkTempDir("airpod-candidates-empty-");
  try {
    await fs.writeFile(path.join(dir, "README.md"), "hi\n");
    const candidates = await findDockerfileCandidates(dir);
    assert.deepEqual(candidates, []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("getCommitSha: matches `git rev-parse HEAD` in a local repo (no network)", async () => {
  const dir = await mkTempDir("airpod-commitsha-");
  try {
    await pexec("git", ["init", "-q"], { cwd: dir });
    await pexec("git", ["-c", "user.email=test@test.com", "-c", "user.name=test", "commit", "--allow-empty", "-q", "-m", "init"], {
      cwd: dir,
    });
    const { stdout } = await pexec("git", ["rev-parse", "HEAD"], { cwd: dir });
    const expected = stdout.trim();

    assert.equal(await getCommitSha(dir), expected);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
