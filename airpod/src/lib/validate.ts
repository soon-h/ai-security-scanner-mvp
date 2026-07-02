// Repo 입력 사전 검증 (spec User story 6). 라우트 밖 순수 함수로 분리해 유닛테스트 가능하게 한다.
// 여기서 걸러내는 건 "명백히 잘못된 입력"이다 — git 자체의 존재/권한 검증(레포 실존 여부 등)은
// clone 단계에서 실패하고 fallback으로 이어진다(spec §8-A-4).

export const DEFAULT_BRANCH = "main";
const MAX_PAT_LENGTH = 255;

// 원격 URL(https/http/git@) 외에 로컬 파일 경로도 허용한다 — cloneRepo가 결국 `git clone <target>`을
// 그대로 실행하고 git은 로컬 경로도 clone 대상으로 받아들이며, 실제로 로컬 fixture repo를 이 필드에
// 넣어 점검하는 흐름이 이미 쓰이고 있다(오프라인 데모/수동 검증). 여기서 거르는 건 완전히 빈 값이나
// 공백처럼 "명백히 잘못된" 입력뿐이다.
const REMOTE_URL_RE = /^(https?:\/\/|git@)\S+$/;
const LOCAL_PATH_RE = /^([A-Za-z]:[\\/]|\/|\.\.?[\\/])\S*$/;

export function validateRepoUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "Repository URL을 입력하세요.";
  if (/\s/.test(trimmed)) return "Repository URL에 공백을 포함할 수 없습니다.";
  if (!REMOTE_URL_RE.test(trimmed) && !LOCAL_PATH_RE.test(trimmed)) {
    return "Repository URL은 https://, http://, git@ 또는 로컬 경로 형식이어야 합니다.";
  }
  return null;
}

export function validateBranch(branch: string): string | null {
  const trimmed = branch.trim();
  if (!trimmed) return null; // 비우면 기본값(main) 사용 — 유효한 입력
  if (/\s/.test(trimmed) || trimmed.includes("..") || /[\x00-\x1f]/.test(trimmed)) {
    return "Branch 이름이 올바르지 않습니다.";
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed)) {
    return "Branch 이름은 영문·숫자·.·_·-·/ 만 사용할 수 있습니다.";
  }
  return null;
}

export function validatePat(pat: string | undefined, repoUrl: string): string | null {
  if (!pat) return null;
  if (/\s/.test(pat)) return "PAT에 공백을 포함할 수 없습니다.";
  if (pat.length > MAX_PAT_LENGTH) return "PAT 길이가 너무 깁니다.";
  if (!/^https?:\/\//.test(repoUrl.trim())) {
    return "PAT는 HTTPS repository URL에만 사용할 수 있습니다.";
  }
  return null;
}

// candidatePath는 discover가 돌려준 후보 중 하나를 그대로 되돌려받는 정상 흐름이라 화이트리스트
// 검증까지는 하지 않는다 — 다만 경로 탈출(.., 절대경로, 역슬래시)만 형태로 거른다.
export function validateCandidatePath(candidatePath: string | undefined): string | null {
  if (!candidatePath) return null;
  if (candidatePath.includes("\\")) return "candidatePath에 역슬래시를 포함할 수 없습니다.";
  if (candidatePath.startsWith("/") || /^[A-Za-z]:/.test(candidatePath)) {
    return "candidatePath는 상대경로여야 합니다.";
  }
  if (candidatePath.split("/").includes("..")) {
    return "candidatePath에 '..' 를 포함할 수 없습니다.";
  }
  return null;
}

export interface ScanInput {
  repoUrl?: string;
  branch?: string;
  pat?: string;
  candidatePath?: string;
}

export type ScanInputResult =
  | { ok: true; repoUrl: string; branch: string; pat?: string; candidatePath?: string }
  | { ok: false; error: string };

export function validateScanInput(input: ScanInput): ScanInputResult {
  const repoUrl = (input.repoUrl || "").trim();
  const repoUrlError = validateRepoUrl(repoUrl);
  if (repoUrlError) return { ok: false, error: repoUrlError };

  const rawBranch = input.branch ?? "";
  const branchError = validateBranch(rawBranch);
  if (branchError) return { ok: false, error: branchError };
  const branch = rawBranch.trim() || DEFAULT_BRANCH;

  const patError = validatePat(input.pat, repoUrl);
  if (patError) return { ok: false, error: patError };

  const candidatePathError = validateCandidatePath(input.candidatePath);
  if (candidatePathError) return { ok: false, error: candidatePathError };

  return { ok: true, repoUrl, branch, pat: input.pat || undefined, candidatePath: input.candidatePath || undefined };
}
