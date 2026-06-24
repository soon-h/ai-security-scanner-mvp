---
title: "Claude AI 취약점 분석"
status: ready-for-agent
priority: high
assignee: null
---

## What to build

Claude AI를 사용하여 서버에서 수집한 정보와 NVD 취약점 데이터를 분석합니다. AI에 다음을 제공합니다: 수집한 서버 정보(패키지 목록, 보안 설정), NVD 캐시 데이터. Claude는 영향받는 CVE, 심각도(CVSS 점수 기반), 한국어 영향도 분석, 한국어 조치 방법을 반환합니다. AI 응답을 파싱하여 취약점 레코드를 생성하고 영향받는 서버와 연결합니다.

**핵심 요소:**
- Claude API 호출
- 프롬프트 설계 (서버 정보 + NVD 데이터 제공)
- 취약점 분류 (심각도: 매우심각/높음/중간/낮음)
- 한국어 영향도 분석
- 한국어 조치 방법 생성
- AI 응답 파싱
- vulnerabilities 테이블 저장
- 영향받는 서버 매칭

## Acceptance criteria

- [ ] Claude API 호출 구현 (API 키 관리)
- [ ] 프롬프트 설계 및 최적화
- [ ] 서버 정보 + NVD 데이터 전송
- [ ] AI 응답 파싱 (CVE, 심각도, 영향도, 조치 방법)
- [ ] 심각도 분류 (CVSS 점수를 4단계로 매핑)
- [ ] 한국어 출력 검증
- [ ] vulnerabilities 테이블에 저장
- [ ] 영향받는 서버 식별 및 매칭
- [ ] 서버 상태 업데이트 (최고 심각도로)
- [ ] 오류 처리 (API 비용 초과, 네트워크 오류)
- [ ] 단위/통합 테스트: Claude API 모킹, 분석 검증

## Blocked by

- [서버 점검 안정성](../6-scan-stability/issue.md)
- [NVD API 통합 & 캐싱](../7-nvd-integration/issue.md)
