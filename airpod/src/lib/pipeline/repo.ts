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

// git clone. git은 로컬에 설치돼 있다(이 executor와 무관). 실패 시 예외.
export async function cloneRepo(repoUrl: string): Promise<CloneResult> {
  const base = path.join(os.tmpdir(), "airpod-workspaces");
  await fs.mkdir(base, { recursive: true });
  const workdir = path.join(base, `repo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  await pexec("git", ["clone", "--depth", "1", repoUrl, workdir], { timeout: 120_000 });

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
