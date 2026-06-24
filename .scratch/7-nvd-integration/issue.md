---
title: "NVD API 통합 & 캐싱"
status: ready-for-agent
priority: high
assignee: null
---

## What to build

국가 취약점 데이터베이스(NVD)에서 최신 CVE 정보를 가져오고, 로컬에 캐싱하여 오프라인 모드에서도 동작하도록 합니다. NVD API를 주기적으로 호출하여 데이터를 업데이트하고, API가 불가능할 때는 캐시된 이전 데이터를 사용합니다. 수집한 패키지 버전 정보와 CVE를 자동으로 매칭하여 영향받는 취약점을 식별합니다.

**핵심 요소:**
- NVD API 호출 (NIST CVE API)
- CVE 정보 캐싱 (로컬 저장)
- 캐시 업데이트 로직
- 오프라인 모드 (API 불가 시 캐시 사용)
- 패키지 버전과 CVE 매칭
- vulnerability_mappings 테이블 생성

## Acceptance criteria

- [ ] NVD API 호출 구현
- [ ] CVE 정보 로컬 캐싱 (JSON 또는 데이터베이스)
- [ ] 캐시 업데이트 로직 (주기적 또는 온디맨드)
- [ ] API 불가 시 캐시 사용 (폴백 메커니즘)
- [ ] 패키지 버전과 CVE 매칭 로직
- [ ] vulnerability_mappings 데이터 생성
- [ ] 캐시 상태 모니터링 API (마지막 업데이트 시간 등)
- [ ] 오류 처리 (API 타임아웃, 네트워크 오류)
- [ ] 단위/통합 테스트: NVD API 모킹, 캐시 검증

## Blocked by

- [기본 인프라 설정](../1-infra-setup/issue.md)
