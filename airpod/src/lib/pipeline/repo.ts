import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import os from "node:os";
import { analyzeDockerfile } from "../analysis/dockerfile";

const pexec = promisify(execFile);

export interface CloneResult {
  workdir: string;
  dockerfilePath: string | null;
  dockerfileContent: string | null;
  commitSha: string;
}

export interface DockerfileCandidate {
  path: string; // workdir 기준 상대경로, "/" 구분자로 정규화
  baseImageGuess: string | null;
}

// PAT를 HTTPS URL에 임시로 실어 인증한다(x-access-token 스킴, GitHub PAT clone 표준 방식).
// 이 URL은 clone 호출에만 쓰이고 CloneResult 등 어떤 반환값·로그에도 포함되지 않는다.
// ssh(git@) URL이나 pat 미지정 시에는 원본을 그대로 반환한다.
export function buildAuthenticatedUrl(repoUrl: string, pat?: string): string {
  if (!pat || !/^https?:\/\//.test(repoUrl)) return repoUrl;
  const u = new URL(repoUrl);
  u.username = "x-access-token";
  u.password = pat;
  return u.toString();
}

function newWorkdir(prefix: string): Promise<string> {
  const base = path.join(os.tmpdir(), "airpod-workspaces");
  const workdir = path.join(base, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  return fs.mkdir(base, { recursive: true }).then(() => workdir);
}

// git clone. git은 로컬에 설치돼 있다(이 executor와 무관). 실패 시 예외.
// candidatePath가 있으면(=사용자가 후보 목록에서 고른 경우) 그 Dockerfile을 그대로 쓰고,
// 없으면 하위호환을 위해 기존 3-후보 휴리스틱(findDockerfile)으로 자동 감지한다.
export async function cloneRepo(
  repoUrl: string,
  branch: string,
  pat?: string,
  candidatePath?: string,
): Promise<CloneResult> {
  const workdir = await newWorkdir("repo");
  const authedUrl = buildAuthenticatedUrl(repoUrl, pat);
  await pexec("git", ["clone", "--depth", "1", "--branch", branch, authedUrl, workdir], { timeout: 120_000 });

  const commitSha = await getCommitSha(workdir);
  const dockerfilePath = candidatePath
    ? await resolveCandidatePath(workdir, candidatePath)
    : await findDockerfile(workdir);
  const dockerfileContent = dockerfilePath ? await fs.readFile(dockerfilePath, "utf8") : null;
  return { workdir, dockerfilePath, dockerfileContent, commitSha };
}

// 이미지 후보 발견(spec story 7-8): 임시로 clone해 Dockerfile 후보를 모두 나열하고 정리한다.
// 실제 점검은 이 결과를 보고 사용자가 candidatePath를 골라 cloneRepo를 다시 호출하는 흐름이다.
export async function discoverCandidates(
  repoUrl: string,
  branch: string,
  pat?: string,
): Promise<{ candidates: DockerfileCandidate[] }> {
  const workdir = await newWorkdir("discover");
  const authedUrl = buildAuthenticatedUrl(repoUrl, pat);
  try {
    await pexec("git", ["clone", "--depth", "1", "--branch", branch, authedUrl, workdir], { timeout: 120_000 });
    const candidates = await findDockerfileCandidates(workdir);
    return { candidates };
  } finally {
    await cleanupWorkdir(workdir);
  }
}

export async function getCommitSha(workdir: string): Promise<string> {
  const { stdout } = await pexec("git", ["rev-parse", "HEAD"], { cwd: workdir, timeout: 15_000 });
  return stdout.trim();
}

const MAX_WALK_DEPTH = 5;
const SKIP_DIR_NAMES = new Set(["node_modules"]);

// workdir 트리를 재귀 탐색해 파일명이 "dockerfile"(대소문자 무시)인 모든 파일을 후보로 모은다.
// .git 등 숨김 디렉터리와 node_modules는 건너뛴다.
export async function findDockerfileCandidates(workdir: string): Promise<DockerfileCandidate[]> {
  const results: DockerfileCandidate[] = [];

  async function walk(dir: string, relDir: string, depth: number): Promise<void> {
    if (depth > MAX_WALK_DEPTH) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIP_DIR_NAMES.has(entry.name)) continue;
        await walk(path.join(dir, entry.name), rel, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase() === "dockerfile") {
        let baseImageGuess: string | null = null;
        try {
          const content = await fs.readFile(path.join(dir, entry.name), "utf8");
          baseImageGuess = analyzeDockerfile(content).baseImage;
        } catch {
          // 읽기 실패 시 후보는 유지하되 base 이미지 추측만 비운다.
        }
        results.push({ path: rel, baseImageGuess });
      }
    }
  }

  await walk(workdir, "", 0);
  return results;
}

async function resolveCandidatePath(workdir: string, candidatePath: string): Promise<string | null> {
  const p = path.join(workdir, candidatePath);
  try {
    await fs.access(p);
    return p;
  } catch {
    return null; // 후보가 사라졌으면 Dockerfile 없음으로 취급 — build가 자연스럽게 fallback으로 이어진다.
  }
}

async function findDockerfile(workdir: string): Promise<string | null> {
  const candidates = ["Dockerfile", "dockerfile", "docker/Dockerfile"];
  for (const c of candidates) {
    const p = path.join(workdir, c);
    try {
      await fs.access(p);
      return p;
    } catch {
      // continue
    }
  }
  return null;
}

export async function cleanupWorkdir(workdir: string): Promise<void> {
  try {
    await fs.rm(workdir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
