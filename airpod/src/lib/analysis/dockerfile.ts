// Dockerfile 정적 분석 (method D). Docker 없이도 동작한다.
export interface DockerfileFacts {
  present: boolean;
  raw: string;
  // 마지막으로 유효한 USER 지시어 값 (없으면 null → 기본 root)
  lastUser: string | null;
  // 하드코딩 시크릿 후보: ENV/ARG 라인에서 민감 키에 리터럴 값이 붙은 경우
  secretHits: SecretHit[];
  // 마지막 FROM 이미지 참조와 태그 (C-04)
  baseImage: string | null; // e.g. "ubuntu:24.04"
  baseTag: string | null; // e.g. "24.04", "latest", null=태그 없음
  baseDigestPinned: boolean; // FROM ...@sha256:... 형태
  // EXPOSE로 선언된 포트 (C-03 D)
  exposedPorts: number[];
  // HEALTHCHECK 지시어 존재 여부 (C-08). NONE은 부재로 취급
  hasHealthcheck: boolean;
  // 원격 URL을 사용하는 ADD 라인 (C-09)
  remoteAdds: { line: number; raw: string }[];
}

export interface SecretHit {
  line: number;
  key: string;
  raw: string;
}

const SECRET_KEY = /(pass(word)?|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|auth)/i;

export function analyzeDockerfile(content: string | null): DockerfileFacts {
  if (content == null) {
    return {
      present: false, raw: "", lastUser: null, secretHits: [],
      baseImage: null, baseTag: null, baseDigestPinned: false,
      exposedPorts: [], hasHealthcheck: false, remoteAdds: [],
    };
  }
  const lines = content.split(/\r?\n/);
  let lastUser: string | null = null;
  const secretHits: SecretHit[] = [];
  let baseImage: string | null = null;
  let baseTag: string | null = null;
  let baseDigestPinned = false;
  const exposedPorts: number[] = [];
  let hasHealthcheck = false;
  const remoteAdds: { line: number; raw: string }[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const upper = trimmed.toUpperCase();

    if (upper.startsWith("USER ")) {
      lastUser = trimmed.slice(5).trim();
    }

    if (upper.startsWith("FROM ")) {
      // FROM [--platform=...] image[:tag|@digest] [AS name]
      const rest = trimmed.slice(5).trim().replace(/^--platform=\S+\s+/i, "");
      const ref = rest.split(/\s+/)[0]; // AS 절 제거
      baseImage = ref;
      if (ref.includes("@sha256:")) {
        baseDigestPinned = true;
        baseTag = null;
      } else {
        // 레지스트리 포트 콜론과 태그 콜론 구분: 마지막 '/' 뒤에서 ':' 탐색
        const lastSlash = ref.lastIndexOf("/");
        const namePart = ref.slice(lastSlash + 1);
        const colon = namePart.indexOf(":");
        baseTag = colon >= 0 ? namePart.slice(colon + 1) : null;
      }
    }

    if (upper.startsWith("EXPOSE ")) {
      const tokens = trimmed.slice(7).trim().split(/\s+/);
      for (const t of tokens) {
        const port = parseInt(t.split("/")[0], 10);
        if (!Number.isNaN(port)) exposedPorts.push(port);
      }
    }

    if (upper.startsWith("HEALTHCHECK")) {
      // HEALTHCHECK NONE 은 헬스체크를 명시적으로 끈 것 → 부재로 취급
      hasHealthcheck = !/^HEALTHCHECK\s+NONE\b/i.test(trimmed);
    }

    if (upper.startsWith("ADD ")) {
      if (/\bhttps?:\/\//i.test(trimmed)) {
        remoteAdds.push({ line: idx + 1, raw: trimmed });
      }
    }

    if (upper.startsWith("ENV ") || upper.startsWith("ARG ")) {
      // ENV KEY=VALUE 또는 ENV KEY VALUE, ARG KEY=VALUE
      const body = trimmed.slice(4).trim();
      // 여러 KEY=VALUE 쌍 처리
      const pairs = body.split(/\s+/);
      for (const pair of pairs) {
        const eq = pair.indexOf("=");
        const key = eq >= 0 ? pair.slice(0, eq) : pair;
        const value = eq >= 0 ? pair.slice(eq + 1) : "";
        // 값이 실제로 부여된 민감 키만 시크릿으로 본다 (빈 ARG 선언은 제외)
        if (SECRET_KEY.test(key) && value && value !== "") {
          secretHits.push({ line: idx + 1, key, raw: trimmed });
        }
      }
    }
  });

  return {
    present: true, raw: content, lastUser, secretHits,
    baseImage, baseTag, baseDigestPinned, exposedPorts, hasHealthcheck, remoteAdds,
  };
}
