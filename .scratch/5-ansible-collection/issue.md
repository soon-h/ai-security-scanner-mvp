---
title: "Ansible 정보 수집 - 기본 구현"
status: ready-for-agent
priority: high
assignee: null
---

## What to build

Ansible을 사용하여 리눅스 서버에서 필요한 정보를 자동으로 수집합니다. SSH를 통해 다음 정보를 추출합니다: 시스템 정보(OS 버전, 커널, CPU, 메모리, 디스크), 설치된 패키지 목록(버전 포함), 보안 설정(SSH 설정, 방화벽, SELinux, 사용자 권한), 실행 중인 서비스. 수집 후 민감한 정보(비밀번호, API 키, 개인 키)는 자동으로 마스킹합니다.

**핵심 요소:**
- Ansible playbook/모듈 작성
- SSH 연결 및 명령 실행
- 시스템 정보, 패키지, 보안 설정, 서비스 수집
- 수집 결과 구조화 (JSON/dict 형식)
- 민감 정보 자동 마스킹
- 수집 결과 데이터베이스 저장

## Acceptance criteria

- [ ] Ansible 스크립트/모듈 작성
- [ ] SSH를 통해 서버 연결 테스트
- [ ] OS 정보 수집 (버전, 커널, CPU, 메모리, 디스크)
- [ ] 패키지 목록 수집 (rpm, dpkg 등 패키지 매니저 지원)
- [ ] 보안 설정 수집 (SSH, 방화벽, SELinux, sudoers)
- [ ] 실행 중인 서비스 목록 수집
- [ ] 민감 정보 자동 마스킹 (패턴: 비밀번호, API 키, 개인 키)
- [ ] 수집 결과 JSON 형식 출력
- [ ] scan_results 테이블에 저장
- [ ] 단위 테스트: 정보 수집 파이프라인 검증

## Blocked by

- [계정 정보 보안](../4-account-security/issue.md)
