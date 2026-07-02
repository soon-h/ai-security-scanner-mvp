import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const pexec = promisify(execFile);

export interface CloneResult {
  workdir: string;
  dockerfilePath: string | null;
  dockerfileContent: string | null;
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

// git clone. git은 로컬에 설치돼 있다(이 executor와 무관). 실패 시 예외.
export async function cloneRepo(repoUrl: string, branch: string, pat?: string): Promise<CloneResult> {
  const base = path.join(os.tmpdir(), "airpod-workspaces");
  await fs.mkdir(base, { recursive: true });
  const workdir = path.join(base, `repo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const authedUrl = buildAuthenticatedUrl(repoUrl, pat);
  await pexec("git", ["clone", "--depth", "1", "--branch", branch, authedUrl, workdir], { timeout: 120_000 });

  const dockerfilePath = await findDockerfile(workdir);
  const dockerfileContent = dockerfilePath ? await fs.readFile(dockerfilePath, "utf8") : null;
  return { workdir, dockerfilePath, dockerfileContent };
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
