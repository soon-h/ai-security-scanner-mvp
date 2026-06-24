---
title: "서버 자산 CRUD & 대시보드 표시"
status: ready-for-agent
priority: high
assignee: null
---

## What to build

보안담당자가 서버 정보를 추가, 수정, 삭제할 수 있는 API와 대시보드 UI를 구현합니다. 서버 목록을 조회하고, 각 서버의 IP, 호스트명, OS, 마지막 점검 시간, 상태(정상/경고/위험)를 시각적으로 표시합니다.

**핵심 요소:**
- 서버 CRUD API (`POST /api/servers`, `GET /api/servers`, `PUT /api/servers/{id}`, `DELETE /api/servers/{id}`)
- 서버 정보 검증 (IP, 호스트명, OS 필수)
- React 대시보드: 서버 목록 테이블 (IP, 호스트명, OS, 점검 시간, 상태)
- 상태별 시각적 구분 (정상/경고/위험)
- 상태 필터링 기능

## Acceptance criteria

- [ ] 서버 생성/조회/수정/삭제 API 구현
- [ ] 서버 정보 검증 (IP, 호스트명, OS 필수)
- [ ] React에서 서버 목록 표시 (테이블 형식)
- [ ] 각 서버 상태를 시각적으로 구분 (색상/아이콘)
- [ ] 마지막 점검 시간 표시
- [ ] 상태별 필터링 기능 동작
- [ ] API 권한 검증 (로그인 사용자만 접근)

## Blocked by

- [기본 인프라 설정](../1-infra-setup/issue.md)
