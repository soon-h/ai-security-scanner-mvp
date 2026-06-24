---
title: "기본 인프라 설정 (DB, API, UI 기본틀)"
status: ready-for-agent
priority: high
assignee: null
---

## What to build

MVP의 기반이 되는 인프라를 구축합니다. PostgreSQL 데이터베이스 스키마를 설계하고, FastAPI 서버의 기본 구조를 만들며, React 프로젝트를 초기화합니다. 사용자 인증 시스템(ID/비밀번호, JWT)도 함께 구현하여 이후 모든 API 호출에 기반이 될 수 있도록 합니다.

**핵심 요소:**
- PostgreSQL: 5개 테이블 스키마 (servers, credentials, scan_results, vulnerabilities, vulnerability_mappings)
- FastAPI: 기본 서버 설정, 라우터 구조, 인증 미들웨어
- React: 프로젝트 초기화, 기본 컴포넌트 구조 (레이아웃, 라우팅)
- 사용자 인증: 사용자 생성, 로그인, JWT 토큰 발급/검증

## Acceptance criteria

- [ ] PostgreSQL 스키마 생성 (servers, credentials, scan_results, vulnerabilities, vulnerability_mappings 테이블)
- [ ] FastAPI 서버 실행 가능 (http://localhost:8000)
- [ ] 기본 로그인 API 구현 (`POST /api/auth/login`)
- [ ] JWT 토큰 기반 인증 미들웨어 구현
- [ ] React 프로젝트 초기화 및 기본 레이아웃 구성
- [ ] 로그인 페이지 UI 구현
- [ ] Docker 또는 로컬 환경에서 전체 스택 실행 가능

## Blocked by

None - can start immediately
