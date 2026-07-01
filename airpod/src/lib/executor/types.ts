import type { EvidenceSource } from "../types";

// 런타임 점검을 위한 컨테이너 실행 추상화.
// 실제 구현(DockerExecutor)과 시뮬레이션(StubExecutor)이 동일 인터페이스를 만족한다.
// Docker 설치 후에도 오케스트레이터/점검 로직을 바꾸지 않고 executor만 교체할 수 있다.
export interface RuntimeExecutor {
  readonly kind: "docker" | "stub";
  readonly source: EvidenceSource; // 이 executor가 만든 evidence의 출처 표기

  // 이미지 빌드. 실패 시 예외를 던진다(오케스트레이터가 local fallback 처리).
  build(workdir: string, tag: string): Promise<BuildResult>;

  // 격리 옵션 하에 컨테이너 실행. 점검이 끝나면 stop()으로 정리한다.
  run(imageRef: string): Promise<RunHandle>;

  // 실행 중 컨테이너의 프로세스 UID (C-01 R). null이면 확인 불가 → review.
  inspectRuntimeUid(handle: RunHandle): Promise<number | null>;

  // 컨테이너 내부 파일의 소유자/모드 조회 (U-16/18/19/22 R). 없으면 null → skip.
  statFile(handle: RunHandle, filePath: string): Promise<FileStat | null>;

  // 컨테이너 내부 텍스트 파일 내용 조회 (U-04/U-05: /etc/passwd 파싱). null=읽기 불가 → review.
  readTextFile(handle: RunHandle, filePath: string): Promise<string | null>;

  // others 쓰기 권한이 있는 파일 목록 (U-25 R). null=관찰 불가 → review.
  worldWritableFiles(handle: RunHandle): Promise<string[] | null>;

  // 실행 컨테이너에서 LISTEN 중인 TCP 포트 (C-03 R). null=관찰 불가 → review.
  listeningPorts(handle: RunHandle): Promise<number[] | null>;

  // 상주하는 위험 패키지/도구 목록 (C-05 R). null=관찰 불가 → review.
  riskyPackages(handle: RunHandle): Promise<string[] | null>;

  // 예상 외 setuid/setgid 바이너리 목록 (C-06 R). null=관찰 불가 → review.
  suidSgidBinaries(handle: RunHandle): Promise<string[] | null>;

  // 루트 파일시스템 쓰기 가능 여부 (C-07 R). null=관찰 불가 → review.
  rootFsWritable(handle: RunHandle): Promise<boolean | null>;

  stop(handle: RunHandle): Promise<void>;
}

export interface BuildResult {
  imageRef: string;
  logTail: string;
}

export interface RunHandle {
  containerId: string;
  imageRef: string;
}

export interface FileStat {
  path: string;
  owner: string; // e.g. "root"
  group: string;
  mode: string; // octal string e.g. "644"
}
