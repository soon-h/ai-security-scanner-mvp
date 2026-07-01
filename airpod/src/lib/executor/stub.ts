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
    // 일반 base 이미지의 현실적 기본값: /etc/passwd 는 root:root 644 (양호).
    if (filePath === "/etc/passwd") {
      return { path: filePath, owner: "root", group: "root", mode: "644" };
    }
    return null;
  }

  async stop(_handle: RunHandle): Promise<void> {
    // no-op
  }
}
