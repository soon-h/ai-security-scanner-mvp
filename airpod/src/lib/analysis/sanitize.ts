// Claude API 전달 전 민감정보 제거·마스킹 (spec §6, §12).
// PAT 노출은 로그/AI payload/DB 유출로 이어지므로 반드시 전처리한다.

const MASK = "«REDACTED»";

const PATTERNS: { name: string; re: RegExp }[] = [
  // GitHub PAT (classic ghp_, fine-grained github_pat_)
  { name: "github_pat", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  { name: "github_pat_fg", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  // private repo URL 내 인증정보: https://user:token@host
  { name: "url_creds", re: /(https?:\/\/)[^/\s:@]+:[^/\s@]+@/g },
  // Authorization 헤더
  { name: "authorization", re: /(authorization\s*[:=]\s*)(bearer\s+)?[A-Za-z0-9._\-]+/gi },
  // key=value 형태의 민감 값
  {
    name: "kv_secret",
    re: /((?:pass(?:word)?|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]\s*)(["']?)([^\s"']+)\2/gi,
  },
  // SSH private key / 인증서 블록
  { name: "private_key_block", re: /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g },
  // AWS access key id
  { name: "aws_akid", re: /\bAKIA[0-9A-Z]{16}\b/g },
];

export interface SanitizeResult {
  text: string;
  redactions: { name: string; count: number }[];
}

export function sanitize(input: string): SanitizeResult {
  let text = input;
  const redactions: { name: string; count: number }[] = [];

  for (const { name, re } of PATTERNS) {
    let count = 0;
    text = text.replace(re, (...args) => {
      count += 1;
      // kv_secret / authorization / url_creds 는 접두부는 살리고 값만 마스킹
      if (name === "kv_secret") {
        const prefix = args[1];
        return `${prefix}${MASK}`;
      }
      if (name === "authorization") {
        const prefix = args[1];
        return `${prefix}${MASK}`;
      }
      if (name === "url_creds") {
        const scheme = args[1];
        return `${scheme}${MASK}@`;
      }
      return MASK;
    });
    if (count > 0) redactions.push({ name, count });
  }

  return { text, redactions };
}

// 객체를 통째로 sanitize (evidence data 등). JSON 직렬화 후 마스킹.
export function sanitizeObject<T>(obj: T): { value: T; redactions: { name: string; count: number }[] } {
  const { text, redactions } = sanitize(JSON.stringify(obj));
  return { value: JSON.parse(text) as T, redactions };
}
