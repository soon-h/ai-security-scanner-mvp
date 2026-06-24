---
title: "CSV 임포트 기능"
status: ready-for-agent
priority: high
assignee: null
---

## What to build

보안담당자가 CSV 파일에서 여러 서버 정보를 한 번에 임포트할 수 있는 기능을 구현합니다. 파일 형식을 검증하고, 필수 필드(IP, 호스트명, OS, 계정)를 확인하며, 오류가 있는 행에 대해 상세한 에러 메시지를 제공합니다. 부분 성공을 지원하여 유효한 행은 등록하고 오류가 있는 행만 보고합니다.

**핵심 요소:**
- CSV 파일 파싱 및 검증
- 필수 필드 확인 (IP, 호스트명, OS, 계정)
- 행별 오류 상세 메시지
- 부분 성공 처리 (일부 행 실패해도 나머지는 등록)
- 임포트 결과 요약 보고
- React 임포트 UI (파일 업로드, 결과 표시)

## Acceptance criteria

- [ ] CSV 파일 업로드 API 구현 (`POST /api/servers/import`)
- [ ] 필수 필드 검증 (IP, 호스트명, OS, 계정)
- [ ] 오류 행에 대한 상세 메시지 반환 (행 번호, 오류 사유)
- [ ] 부분 성공 처리 (성공/실패 행 수 반환)
- [ ] React에 임포트 페이지 구현
- [ ] 파일 선택 및 업로드 UI
- [ ] 임포트 결과 (성공/실패 요약) 표시
- [ ] CSV 형식 다양화 지원 (Excel .xlsx 파일 추가 지원 선택)

## Blocked by

- [서버 자산 CRUD & 대시보드 표시](../2-server-crud/issue.md)
