import type { CatalogItem } from "./types";

// Slice 1 정적 카탈로그 — 3개 항목으로 E2E를 관통한다 (spec §5.2).
// 이후 슬라이스에서 C-03~C-09, U-01~U-67, W-01~W-27로 확장된다.
export const CATALOG: CatalogItem[] = [
  {
    id: "C-01",
    category: "container_hardening",
    title: "root(UID 0) 실행",
    severity: "High",
    method: "D+R",
    failCriterion: "USER 미지정 or 실행 UID=0",
  },
  {
    id: "C-02",
    category: "container_hardening",
    title: "하드코딩 시크릿",
    severity: "Critical",
    method: "D",
    failCriterion: "ENV/ARG에 password·token·key 패턴",
  },
  {
    id: "C-03",
    category: "container_hardening",
    title: "불필요한 노출 포트",
    severity: "Medium",
    method: "D+R",
    failCriterion: "관리·DB 포트(22, 3306 등) EXPOSE/LISTEN",
  },
  {
    id: "C-04",
    category: "container_hardening",
    title: "base 이미지 태그 미고정",
    severity: "Medium",
    method: "D",
    failCriterion: ":latest 또는 태그 없음",
  },
  {
    id: "C-05",
    category: "container_hardening",
    title: "위험 패키지 잔존",
    severity: "Medium",
    method: "R",
    failCriterion: "curl/wget/gcc/apt 등 빌드·네트워크 도구 상주",
  },
  {
    id: "C-06",
    category: "container_hardening",
    title: "setuid/setgid 바이너리",
    severity: "High",
    method: "R",
    failCriterion: "예상 외 setuid/setgid 바이너리 존재",
  },
  {
    id: "C-07",
    category: "container_hardening",
    title: "쓰기 가능 루트 FS",
    severity: "Medium",
    method: "R",
    failCriterion: "--read-only 미적용 시 루트 FS 쓰기 가능",
  },
  {
    id: "C-08",
    category: "container_hardening",
    title: "HEALTHCHECK 부재",
    severity: "Low",
    method: "D",
    failCriterion: "HEALTHCHECK 지시어 없음",
  },
  {
    id: "C-09",
    category: "container_hardening",
    title: "ADD 원격 사용",
    severity: "Low",
    method: "D",
    failCriterion: "COPY 대신 원격 URL ADD 사용",
  },
  {
    id: "U-16",
    category: "unix",
    title: "/etc/passwd 파일 소유자 및 권한 설정",
    severity: "High",
    method: "R",
    failCriterion: "소유자 root 아님 또는 권한이 644 초과",
  },
];

export function getCatalogItem(id: string): CatalogItem {
  const item = CATALOG.find((c) => c.id === id);
  if (!item) throw new Error(`Unknown catalog id: ${id}`);
  return item;
}
