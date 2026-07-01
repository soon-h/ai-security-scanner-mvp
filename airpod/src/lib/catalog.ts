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
