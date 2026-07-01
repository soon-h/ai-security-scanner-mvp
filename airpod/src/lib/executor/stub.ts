import type { RuntimeExecutor, BuildResult, RunHandle, FileStat } from "./types";

// Docker 미설치 환경에서 E2E 파이프라인을 끝까지 돌리기 위한 시뮬레이션 executor.
// 모든 evidence의 source는 "stub"으로 표기되어 실제 런타임 점검과 구분된다.
// 원칙: 취약을 조작해서 심지 않는다. 실제 컨테이너를 관찰할 수 없는 항목은
//   - 정적 근거(Dockerfile)가 있으면 그쪽에 판단을 넘기고(uid=null → C-01은 USER 지시어로 평가),
//   - 정적 근거가 없으면 일반 base 이미지의 현실적 기본값을 반환한다(/etc/passwd 644 = 양호).
// 이렇게 해야 취약 레포/안전 레포의 대비가 실제 설정 차이에서 드러난다.
export class StubExecutor implements RuntimeExecutor {
  readonly kind = "stub" as const;
  readonly source = "stub" as const;

  async build(_workdir: string, tag: string): Promise<BuildResult> {
    return {
      imageRef: tag,
      logTail: "[stub] docker 미설치 — 빌드를 시뮬레이션했습니다.",
    };
  }

  async run(imageRef: string): Promise<RunHandle> {
    return { containerId: `stub-${Math.random().toString(36).slice(2, 8)}`, imageRef };
  }

  async inspectRuntimeUid(_handle: RunHandle): Promise<number | null> {
    // 실제 실행 UID는 관찰할 수 없다. null을 반환해 C-01 판단을 Dockerfile USER 지시어(정적)에 넘긴다.
    return null;
  }

  async statFile(_handle: RunHandle, filePath: string): Promise<FileStat | null> {
    // 일반 base 이미지의 현실적 기본값(양호). 취약을 지어내지 않는다.
    const defaults: Record<string, FileStat> = {
      "/etc/passwd": { path: "/etc/passwd", owner: "root", group: "root", mode: "644" },
      "/etc/shadow": { path: "/etc/shadow", owner: "root", group: "shadow", mode: "640" },
      "/etc/hosts": { path: "/etc/hosts", owner: "root", group: "root", mode: "644" },
      "/etc/services": { path: "/etc/services", owner: "root", group: "root", mode: "644" },
    };
    return defaults[filePath] ?? null;
  }

  async readTextFile(_handle: RunHandle, filePath: string): Promise<string | null> {
    // 일반 base 이미지의 현실적 기본 /etc/passwd (shadow 사용, UID 0은 root 단독).
    if (filePath === "/etc/passwd") {
      return [
        "root:x:0:0:root:/root:/bin/bash",
        "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin",
        "bin:x:2:2:bin:/bin:/usr/sbin/nologin",
        "nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin",
      ].join("\n");
    }
    return null;
  }

  async worldWritableFiles(_handle: RunHandle): Promise<string[] | null> {
    // 실제 파일시스템을 관찰할 수 없다 → null (룰 평가에서 review).
    return null;
  }

  // 아래 런타임 관찰은 실제 컨테이너 없이는 정직하게 알 수 없다 → null 반환.
  // 룰 평가는 이를 review(자동 평가 어려움)로 처리한다. 취약/양호를 지어내지 않는다.
  async listeningPorts(_handle: RunHandle): Promise<number[] | null> {
    return null;
  }

  async riskyPackages(_handle: RunHandle): Promise<string[] | null> {
    return null;
  }

  async suidSgidBinaries(_handle: RunHandle): Promise<string[] | null> {
    return null;
  }

  async rootFsWritable(_handle: RunHandle): Promise<boolean | null> {
    return null;
  }

  async stop(_handle: RunHandle): Promise<void> {
    // no-op
  }
}
