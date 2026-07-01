import type { RuntimeExecutor } from "./types";
import { StubExecutor } from "./stub";
import { DockerExecutor, isDockerAvailable } from "./docker";

export type { RuntimeExecutor, RunHandle, FileStat, BuildResult } from "./types";

// AIRPOD_EXECUTOR: auto | docker | stub
export async function pickExecutor(): Promise<RuntimeExecutor> {
  const mode = (process.env.AIRPOD_EXECUTOR || "auto").toLowerCase();
  if (mode === "stub") return new StubExecutor();
  if (mode === "docker") return new DockerExecutor();

  // auto: docker 데몬이 실제로 응답하면 docker, 아니면 stub로 자동 강등
  if (await isDockerAvailable()) return new DockerExecutor();
  return new StubExecutor();
}
