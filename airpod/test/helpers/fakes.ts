import type { RuntimeExecutor, RunHandle, BuildResult, FileStat } from "../../src/lib/executor/types";
import type { EvidenceSource } from "../../src/lib/types";

// 결정적 fake executor. 실제 Docker 없이 원하는 런타임 evidence를 주입해
// evidence→판정 seam을 검증한다. build/run 실패도 시뮬레이션해 fallback 경로를 테스트한다.
export interface FakeOptions {
  source?: EvidenceSource;
  buildFails?: boolean;
  runFails?: boolean;
  runtimeUid?: number | null;
  listeningPorts?: number[] | null;
  riskyPackages?: string[] | null;
  suid?: string[] | null;
  rootFsWritable?: boolean | null;
  worldWritable?: string[] | null;
  passwd?: string | null;
  fileStats?: Record<string, FileStat | null>;
}

export class FakeExecutor implements RuntimeExecutor {
  readonly kind = "docker" as const;
  readonly source: EvidenceSource;
  stopped = false;
  constructor(private readonly o: FakeOptions = {}) {
    this.source = o.source ?? "docker";
  }
  async build(_workdir: string, tag: string): Promise<BuildResult> {
    if (this.o.buildFails) throw new Error("fake build failure");
    return { imageRef: tag, logTail: "fake build ok" };
  }
  async run(imageRef: string): Promise<RunHandle> {
    if (this.o.runFails) throw new Error("fake run failure");
    return { containerId: "fakecontainerid00", imageRef };
  }
  async inspectRuntimeUid(): Promise<number | null> {
    return this.o.runtimeUid ?? null;
  }
  async statFile(_h: RunHandle, filePath: string): Promise<FileStat | null> {
    return this.o.fileStats?.[filePath] ?? null;
  }
  async readTextFile(_h: RunHandle, filePath: string): Promise<string | null> {
    if (filePath === "/etc/passwd") return this.o.passwd ?? null;
    return null;
  }
  async worldWritableFiles(): Promise<string[] | null> {
    return this.o.worldWritable ?? null;
  }
  async listeningPorts(): Promise<number[] | null> {
    return this.o.listeningPorts ?? null;
  }
  async riskyPackages(): Promise<string[] | null> {
    return this.o.riskyPackages ?? null;
  }
  async suidSgidBinaries(): Promise<string[] | null> {
    return this.o.suid ?? null;
  }
  async rootFsWritable(): Promise<boolean | null> {
    return this.o.rootFsWritable ?? null;
  }
  async stop(): Promise<void> {
    this.stopped = true;
  }
}

const perm = (path: string, mode: string, owner = "root", group = "root"): FileStat => ({ path, owner, group, mode });

// 취약 프리셋: 모든 런타임 항목이 fail이 나오도록 evidence를 구성한다.
export function vulnerableOptions(): FakeOptions {
  return {
    runtimeUid: 0,
    listeningPorts: [22, 3306],
    riskyPackages: ["curl", "wget"],
    suid: ["/usr/bin/su", "/usr/bin/xxd"], // xxd = 예상 외
    rootFsWritable: true,
    worldWritable: ["/opt/bad", "/var/tmp/loose"],
    passwd: [
      "root:x:0:0:root:/root:/bin/bash",
      "backdoor:x:0:0::/root:/bin/sh", // U-05 fail
      "legacy:$6$abc$deadbeef:1001:1001::/home/legacy:/bin/sh", // U-04 fail (passwd에 해시)
    ].join("\n"),
    fileStats: {
      "/etc/passwd": perm("/etc/passwd", "666"), // U-16 fail
      "/etc/shadow": perm("/etc/shadow", "644"), // U-18 fail (others read)
      "/etc/hosts": perm("/etc/hosts", "644"), // U-19 pass
      "/etc/services": perm("/etc/services", "666"), // U-22 fail
    },
  };
}

// 안전 프리셋: 모든 런타임 항목이 pass가 나오도록 evidence를 구성한다.
export function safeOptions(): FakeOptions {
  return {
    runtimeUid: 1000,
    listeningPorts: [8080],
    riskyPackages: [],
    suid: ["/usr/bin/su", "/usr/bin/passwd"], // 모두 기대 범위
    rootFsWritable: false,
    worldWritable: [],
    passwd: [
      "root:x:0:0:root:/root:/bin/bash",
      "app:x:1000:1000::/home/app:/usr/sbin/nologin",
    ].join("\n"),
    fileStats: {
      "/etc/passwd": perm("/etc/passwd", "644"),
      "/etc/shadow": perm("/etc/shadow", "640", "root", "shadow"),
      "/etc/hosts": perm("/etc/hosts", "644"),
      "/etc/services": perm("/etc/services", "644"),
    },
  };
}
