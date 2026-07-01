// Dockerfile 정적 분석 (method D). Docker 없이도 동작한다.
export interface DockerfileFacts {
  present: boolean;
  raw: string;
  // 마지막으로 유효한 USER 지시어 값 (없으면 null → 기본 root)
  lastUser: string | null;
  // 하드코딩 시크릿 후보: ENV/ARG 라인에서 민감 키에 리터럴 값이 붙은 경우
  secretHits: SecretHit[];
}

export interface SecretHit {
  line: number;
  key: string;
  raw: string;
}

const SECRET_KEY = /(pass(word)?|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|auth)/i;

export function analyzeDockerfile(content: string | null): DockerfileFacts {
  if (content == null) {
    return { present: false, raw: "", lastUser: null, secretHits: [] };
  }
  const lines = content.split(/\r?\n/);
  let lastUser: string | null = null;
  const secretHits: SecretHit[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const upper = trimmed.toUpperCase();

    if (upper.startsWith("USER ")) {
      lastUser = trimmed.slice(5).trim();
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

  return { present: true, raw: content, lastUser, secretHits };
}
