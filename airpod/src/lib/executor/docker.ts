import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeExecutor, BuildResult, RunHandle, FileStat } from "./types";

const pexec = promisify(execFile);

async function docker(args: string[], timeoutMs = 120_000): Promise<string> {
  const { stdout } = await pexec("docker", args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

// 실제 Docker CLI 기반 executor. host docker socket을 사용하는 로컬 데몬에 build/run 한다 (spec §12).
// Sandbox 격리 옵션(spec §9)을 run 시 적용한다.
export class DockerExecutor implements RuntimeExecutor {
  readonly kind = "docker" as const;
  readonly source = "docker" as const;

  async build(workdir: string, tag: string): Promise<BuildResult> {
    const out = await docker(["build", "-t", tag, workdir], 300_000);
    return { imageRef: tag, logTail: out.split("\n").slice(-20).join("\n") };
  }

  async run(imageRef: string): Promise<RunHandle> {
    // 격리 실행: 네트워크 차단, 읽기전용 FS, 모든 capability 제거, 메모리/PID 제한.
    // 점검을 위해 컨테이너를 유지해야 하므로 sleep 엔트리포인트로 띄운다.
    const out = await docker([
      "run", "-d", "--rm",
      "--network", "none",
      "--read-only",
      "--cap-drop", "ALL",
      "--memory", "512m",
      "--pids-limit", "256",
      "--entrypoint", "",
      imageRef,
      "sleep", "120",
    ]);
    const containerId = out.trim();
    return { containerId, imageRef };
  }

  async inspectRuntimeUid(handle: RunHandle): Promise<number | null> {
    try {
      const out = await docker(["exec", handle.containerId, "id", "-u"]);
      const uid = parseInt(out.trim(), 10);
      return Number.isNaN(uid) ? null : uid;
    } catch {
      return null;
    }
  }

  async statFile(handle: RunHandle, filePath: string): Promise<FileStat | null> {
    try {
      // stat 포맷: 8진수 모드 소유자 그룹
      const out = await docker(["exec", handle.containerId, "stat", "-c", "%a %U %G", filePath]);
      const [mode, owner, group] = out.trim().split(/\s+/);
      return { path: filePath, owner, group, mode };
    } catch {
      // 파일이 없으면 stat 실패 → skip 대상
      return null;
    }
  }

  async listeningPorts(handle: RunHandle): Promise<number[] | null> {
    // /proc/net/tcp(6) 파싱: st==0A(LISTEN)인 local_address의 포트(hex)를 추출.
    // ss/netstat 부재 환경에서도 동작한다.
    try {
      const ports = new Set<number>();
      for (const f of ["/proc/net/tcp", "/proc/net/tcp6"]) {
        let out: string;
        try {
          out = await docker(["exec", handle.containerId, "cat", f]);
        } catch {
          continue;
        }
        for (const line of out.split("\n").slice(1)) {
          const cols = line.trim().split(/\s+/);
          if (cols.length < 4) continue;
          const local = cols[1];
          const state = cols[3];
          if (state !== "0A") continue; // LISTEN
          const hexPort = local.split(":")[1];
          if (hexPort) ports.add(parseInt(hexPort, 16));
        }
      }
      return [...ports].sort((a, b) => a - b);
    } catch {
      return null;
    }
  }

  async riskyPackages(handle: RunHandle): Promise<string[] | null> {
    const candidates = ["curl", "wget", "gcc", "cc", "apt", "apt-get", "dpkg", "yum", "apk", "nc", "netcat", "ncat", "make", "perl"];
    try {
      const script = candidates.map((c) => `command -v ${c} >/dev/null 2>&1 && echo ${c}`).join("; ");
      const out = await docker(["exec", handle.containerId, "sh", "-c", script]);
      return out.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
      return null;
    }
  }

  async suidSgidBinaries(handle: RunHandle): Promise<string[] | null> {
    try {
      const out = await docker(
        ["exec", handle.containerId, "sh", "-c",
          "find / -xdev \\( -perm -4000 -o -perm -2000 \\) -type f 2>/dev/null | head -100"],
        60_000,
      );
      return out.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
      return null;
    }
  }

  async rootFsWritable(handle: RunHandle): Promise<boolean | null> {
    try {
      const out = await docker(
        ["exec", handle.containerId, "sh", "-c",
          "touch /.airpod_wtest 2>/dev/null && echo yes && rm -f /.airpod_wtest || echo no"],
      );
      const v = out.trim();
      if (v === "yes") return true;
      if (v === "no") return false;
      return null;
    } catch {
      return null;
    }
  }

  async stop(handle: RunHandle): Promise<void> {
    try {
      await docker(["kill", handle.containerId], 30_000);
    } catch {
      // 이미 종료된 경우 무시
    }
  }
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker(["version", "--format", "{{.Server.Version}}"], 8_000);
    return true;
  } catch {
    return false;
  }
}
