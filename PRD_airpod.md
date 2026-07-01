# PRD: AIRPOD — AI 기반 컨테이너 보안 점검 파이프라인 (MVP)

**작성일:** 2026-07-01
**대상 기간:** 14일 핵심 MVP + 3주차 안정화/확장
**개발 조건:** 단독 개발, 하루 평균 3~5시간
**원본 스펙:** `airpod_container_security_prd_final.md`
**관계:** 이전 `PRD_container_security.md`(Next.js 단일 오케스트레이터안)를 대체 — 아키텍처를 FastAPI + Celery + Redis로 변경

---

## Problem Statement

보안 담당자는 GitHub Repository에 있는 Docker 이미지가 배포 가능한 보안 기준을 만족하는지 매번 **손으로** 빌드·실행·점검·분석해야 한다. 그래서:

- Repository마다 점검 기준·실행 방식이 달라 **결과의 일관성이 없다.**
- Dockerfile 하드닝과 실행 컨테이너의 OS/Web 보안 설정을 **따로따로** 확인해야 해서 느리고 누락이 생긴다.
- private Repository의 Dockerfile을 확인하고 최신 Commit으로 빌드해 컨테이너에서 점검하는 과정이 매번 **반복**된다.
- Ansible/명령 실행 결과는 raw 로그라서, 취약점의 의미·위험도·조치방안을 **사람이 직접 해석**해야 한다.
- 여러 Repository·이미지의 보안 상태를 **한 곳에서 비교·관리**하기 어렵다.
- 데모·검증 중 GitHub API·clone·Docker Build가 실패하면 **전체 흐름이 중단**될 위험이 있다.

## Solution

보안 담당자가 Web Dashboard에서 Repository URL·Branch·GitHub PAT를 입력하고 점검 대상 이미지를 선택하면, 최신 Commit으로 이미지를 빌드하고 제한된 Docker Sandbox에서 실행한 뒤 **Ansible 점검 → KISA 기준 판정 → Claude 설명 생성 → Dashboard 확인**까지 무개입으로 한 바퀴 도는 파이프라인(AIRPOD)을 만든다.

- 점검 기준을 **KISA 「주요정보통신기반시설」 항목(컨테이너 하드닝 9 + Unix 67 + Web 27 = 103개 카탈로그)**으로 고정한다.
- **신뢰 경계를 명확히 한다:** Claude가 Ansible evidence와 카탈로그 failCriterion을 근거로 **pass/fail/review 판정과 사람이 읽을 설명·위험도·조치안을 함께** 생성한다. 결정론적 룰은 두 곳에만 쓰인다 — (1) 대상 부재(skip) 판별(보안 판단이 아니라 evidence 존재 여부의 사실), (2) Claude 호출 불가/실패 시의 폴백 판정. Claude는 failCriterion 밖의 새 기준을 만들지 않는다.
- GitHub/Build 실패에도 **로컬 이미지 fallback**으로 핵심 흐름을 이어가 데모 안정성을 확보한다.
- 사용자 경험: "Repository 넣고 → 이미지 선택 → 점검 → 읽히는 리포트 확인."

## User Stories

### Repository 입력·접근 검증
1. 보안 담당자로서, GitHub Repository URL을 입력해 점검을 시작하고 싶다. 그래야 수동 절차 없이 점검이 시작된다.
2. 보안 담당자로서, private Repository 접근을 위해 GitHub PAT를 입력하고 싶다. 그래야 비공개 소스도 점검할 수 있다.
3. 보안 담당자로서, PAT가 점검 작업 중에만 쓰이고 장기 평문 저장되지 않기를 원한다. 그래야 토큰 유출 위험이 줄어든다.
4. 보안 담당자로서, PAT가 로그·Dashboard 결과·AI payload에서 마스킹되기를 원한다. 그래야 어디에서도 토큰이 노출되지 않는다.
5. 보안 담당자로서, Branch를 선택할 수 있고 기본값이 `main`이기를 원한다. 그래야 원하는 시점의 소스를 점검한다.
6. 보안 담당자로서, URL·Branch·PAT 유효성이 점검 진행 전에 확인되기를 원한다. 그래야 잘못된 입력으로 시간을 낭비하지 않는다.

### 이미지 후보 발견·Build
7. 보안 담당자로서, Repository 파일 구조에서 Dockerfile/이미지 후보가 자동 감지되기를 원한다. 그래야 대상을 직접 찾지 않아도 된다.
8. 보안 담당자로서, 감지된 후보 목록에서 점검 대상을 선택하고 싶다. 그래야 원하는 이미지만 점검한다.
9. 보안 담당자로서, `nginx`/`debian` 후보를 선택해 MVP 필수 대상을 점검하고 싶다. 그래야 핵심 시나리오를 검증한다.
10. 보안 담당자로서, 시간이 허용되면 `httpd`/`tomcat`도 같은 흐름으로 점검하고 싶다. 그래야 확장 대상까지 커버한다.
11. 보안 담당자로서, 선택한 이미지를 최신 Commit 기준으로 빌드하고 싶다. 그래야 점검 결과가 현재 소스 상태를 반영한다.
12. 보안 담당자로서, 빌드 이미지에 Commit SHA 기반 태그가 붙기를 원한다. 그래야 점검 결과를 소스 상태와 연결한다.
13. 보안 담당자로서, Dockerfile이 없거나 Build가 실패하면 원인을 명확히 보고 싶다. 그래야 무엇이 문제인지 바로 안다.

### Fallback 경로
14. 보안 담당자로서, GitHub API·clone·Build 실패에도 이미 빌드된 로컬 이미지를 선택해 데모를 이어가고 싶다. 그래야 외부 실패에 발표가 무너지지 않는다.
15. 보안 담당자로서, fallback 점검도 동일한 Ansible·Claude 판정·Dashboard 흐름을 쓰기를 원한다. 그래야 결과 품질이 일관된다.

### Sandbox 실행
16. 보안 담당자로서, 선택한 이미지가 제한된 Docker Sandbox에서 실행되기를 원한다. 그래야 점검 대상이 내 환경을 위협하지 않는다.
17. 보안 담당자로서, Sandbox에 CPU·메모리·프로세스·실행시간 제한이 적용되기를 원한다. 그래야 자원 폭주를 막는다.
18. 보안 담당자로서, 실행이 끝난 컨테이너가 자동 제거되기를 원한다. 그래야 잔여물이 남지 않는다.
19. 보안 담당자로서, 가능한 범위에서 네트워크 차단·읽기전용 FS·capability drop이 적용되기를 원한다. 그래야 격리 수준이 높아진다.
20. 보안 담당자로서, 점검 도구가 SSH 없이 컨테이너에 붙기를 원한다. 그래야 대상 컨테이너를 불필요하게 변형하지 않는다.

### Ansible 점검·KISA 판정
21. 보안 담당자로서, Dockerfile과 실행 컨테이너에 대해 컨테이너/이미지 하드닝 항목이 점검되기를 원한다. 그래야 일관된 하드닝 기준을 적용한다.
22. 보안 담당자로서, 실행 컨테이너에 KISA Unix 서버 점검 항목이 적용되기를 원한다. 그래야 표준 기준으로 OS 취약 설정을 잡는다.
23. 보안 담당자로서, 컨테이너가 웹서버를 포함하면 KISA 웹서비스 점검 항목도 적용되기를 원한다. 그래야 웹 계층도 같은 파이프라인에서 잡는다.
24. 보안 담당자로서, 대상 컨테이너에 해당 파일·서비스·데몬이 없으면 오류가 아니라 `skip`으로 처리되기를 원한다. 그래야 최소 컨테이너라도 파이프라인이 안 끊긴다.
25. 보안 담당자로서, 점검 결과가 `{id, category, severity, status, evidence}` 구조로 산출되기를 원한다. 그래야 결과를 기계적으로 다루고 Claude에 넘긴다.
26. 보안 담당자로서, Claude가 명확한 증거가 있으면 `양호`/`취약`으로 판정하고 증거가 부족·환경 의존적일 때만 `검토`로 판정하기를 원한다. 그래야 판정이 신뢰할 만하다.
27. 보안 담당자로서, 아직 자동화되지 않은 KISA 항목은 카탈로그엔 보이되 자동 판정에서 제외되기를 원한다. 그래야 범위가 투명하다.

### Claude AI 분석
28. 보안 담당자로서, Ansible 결과·KISA 판정이 민감정보 제거 후 Claude에 전달되기를 원한다. 그래야 토큰·시크릿이 외부로 나가지 않는다.
29. 보안 담당자로서, Claude가 evidence·failCriterion 밖의 새 보안 기준을 만들지 않기를 원한다. 그래야 판정이 자의적이지 않고 카탈로그 범위 안에 머문다.
30. 보안 담당자로서, Claude가 취약점 설명·위험도·판정 근거·원인·조치방안·설정 예시를 생성하기를 원한다. 그래야 raw 로그를 직접 해석하지 않는다.
31. 보안 담당자로서, Claude 출력이 고정 JSON 스키마로 제공되기를 원한다. 그래야 Dashboard가 안정적으로 파싱한다.

### Dashboard
32. 보안 담당자로서, 진행 상태를 `Clone → Build → Sandbox → Ansible → AI 판정·설명 → 완료` 단계로 보고 싶다. 그래야 어디까지 됐는지 안다.
33. 보안 담당자로서, 이미지 수·Build 상태·점검 상태·취약점 통계 요약 카드를 보고 싶다. 그래야 위험도를 빠르게 가늠한다.
34. 보안 담당자로서, 이미지별 결과 목록으로 여러 이미지를 비교하고 싶다. 그래야 어느 이미지가 더 위험한지 판단한다.
35. 보안 담당자로서, 상세 화면에서 개별 KISA 항목·evidence·AI 설명·조치 예시를 보고 싶다. 그래야 개별 취약점을 이해한다.
36. 보안 담당자로서, `양호`/`취약` 결과가 명확히 강조되기를 원한다. 그래야 핵심 결과가 한눈에 보인다.
37. 보안 담당자로서, `검토`/`skip` 항목이 과도한 노이즈가 되지 않게 분리 표시되기를 원한다. 그래야 중요한 것에 집중한다.
38. 보안 담당자로서, 동일 이미지 재점검을 실행하고 이전 이력도 유지하고 싶다. 그래야 상태 변화를 추적한다.

## Implementation Decisions

- **아키텍처(최종):** `React/Vite Dashboard → FastAPI Backend → Celery Worker + Redis → 어댑터(GitHub/Docker/Ansible/Claude) → SQLite`. Build·Sandbox·Ansible·Claude는 장시간 작업이라 API 서버와 worker를 분리한다. (팀 사정상 Frontend만 Next.js 유지도 가능하나, Docker/Ansible orchestration은 Python worker로 분리 권장.)
- **모듈 구성(논리적):**
  - *GitHub Adapter* — 접근 검증, 파일 트리 조회, clone.
  - *Docker Adapter* — build, run, exec, cleanup, resource limit.
  - *Ansible Adapter* — `ansible-runner` 실행(Docker exec 기반 연결), JSON 수집. 읽기 전용 점검.
  - *Claude Adapter* — sanitized evidence로 pass/fail/review 판정 요청, structured JSON(판정+설명) 수신.
  - *Catalog Loader* — KISA CSV/JSON 카탈로그 로드(runtime PDF 파싱 안 함).
  - *Judgement Engine* — skip 판별(대상 부재) 및 Claude 호출 불가/실패 시 폴백 pass/fail/review 판정.
- **신뢰 경계(핵심 아키텍처 결정, 개정):** `Ansible evidence → Claude judgement+explanation → Dashboard`. Claude가 evidence와 카탈로그 failCriterion을 근거로 pass/fail/review를 직접 판정하고 그 설명을 함께 생성한다. failCriterion 밖의 새 기준은 만들 수 없다. 결정론적 Judgement Engine은 (1) 대상 부재(skip) 판별과 (2) Claude 호출 불가/실패 시의 폴백 판정에만 관여한다 — 폴백 경로만 완전한 결정론이 보장되며, 실 Claude 호출 경로는 LLM 특성상 완전한 결정론을 보장하지 않는다.
- **점검 결과 표준 스키마(계약):** 각 항목을 아래 형태로 정규화한다.
  ```json
  {
    "id": "C-01", "domain": "container", "category": "container_hardening",
    "title": "root(UID 0) 실행", "severity": "High",
    "status": "fail", "ui_status": "취약",
    "evidence": "Container runs as UID 0",
    "reason": "USER directive is missing and runtime UID is 0",
    "remediation": "Dockerfile에 USER 지시어를 추가하고 non-root로 실행한다.",
    "applicability": "applicable", "automation_status": "automated"
  }
  ```
- **상태 모델:** 내부 `pass/fail/review/skip/not_automated` ↔ UI `양호/취약/검토/제외·해당없음/자동화 전`. 원칙: `skip`은 실패가 아니다; `review`는 자동 판정 실패가 아니라 수동 검토 필요; 명확한 evidence면 `review`보다 `pass`/`fail` 우선; not_automated 항목은 자동 판정 통계에서 제외.
- **점검 기준·카탈로그:** KISA 컨테이너 하드닝 9(C) + Unix 67(U) + Web 27(W) = **103개 카탈로그**. 사전 변환된 static CSV/JSON으로 번들. 카탈로그 항목은 `id, domain, title, description, severity, kisa_severity, container_applicability, automation_status, judgement_rule, remediation, target` 필드를 가진다. 심각도 매핑: 상→High, 중→Medium, 하→Low, 고위험 컨테이너 항목(시크릿·빈 패스워드·UID 0)은 Critical 상향 가능.
- **대상 범위:** 필수 `debian`·`nginx`, 선택 `httpd`·`tomcat`. DB 이미지·표준 이미지 전체 자동 매핑 제외.
- **Fallback(데모 필수):** GitHub/Build 실패 시 이미 빌드된 로컬 이미지를 선택해 동일 점검 흐름을 이어간다. 선택 기능이 아니라 MVP 필수.
- **Docker 실행 방식:** 로컬 MVP는 호스트 Docker daemon 사용. 소켓 접근은 강한 권한이므로 **로컬 단일 사용자/데모 전제에서만** 허용, 제품화 시 rootless/VM/K8s job으로 재설계.
- **Secret Sanitization:** Claude 전송·로그·DB·Dashboard 앞단에서 PAT·token·secret·password·key·Authorization header·private key·인증정보 포함 URL을 제거/마스킹.
- **AI 실패 격리:** Claude 실패 시 전체 점검을 실패로 만들지 않는다. AI 상태만 `ai_failed`로 두고 Ansible/KISA 원본 판정은 그대로 조회 가능.
- **데이터 모델(초안):** Repository, ImageCandidate, ScanJob(`current_stage`로 단계 추적), BuildAttempt, ScanFinding, AiAnalysis.

## Testing Decisions

- **좋은 테스트의 기준:** 내부 함수 구현이 아니라 **외부로 관찰 가능한 동작**만 검증한다("Repository URL을 넣으면 어떤 결과가 조회되는가").
- **최고 seam(단일 경계):** **Scan Job Orchestrator API**를 유일한 테스트 경계로 삼는다. `URL 입력 → 이미지 후보 발견 → Build/fallback → Sandbox → Ansible 수집 → Claude 판정·설명 → 저장 → Dashboard 조회`를 이 한 지점에서 검증한다. 어댑터는 fake로 대체.
- **테스트 종류:** Primary E2E(필수 대상 성공 경로), Vulnerable fixture(심어둔 취약 항목이 fail), Safe fixture(대부분 pass/skip), GitHub/Docker/Ansible/Claude fake adapter 계약, KISA catalog 로드(U-01~67·W-01~27 metadata 유지), **AI 판정**(명확 evidence→pass/fail, 불충분→review; Claude 호출 불가/실패 시에는 결정론적 폴백 판정으로 대체 — 이 폴백 경로만 CI에서 결정론적으로 검증 가능), **Skip-safe**(NFS·SNMP·IIS 등 미존재→skip), **PAT leakage**(로그·AI payload·DB·Dashboard에 PAT 부재), **Fallback**(실패 후 로컬 이미지로 잔여 흐름 성공), **Re-scan**(재점검 시 이력 무손상 — 폴백 경로 기준).
- **픽스처(=Prior art):** 데모용 "취약 레포 1개 + 안전 레포 1개"를 그대로 테스트 픽스처로 재사용한다.
- **비결정성 격리:** 실제 GitHub·Docker Build·Claude 호출은 느리고 비결정적이므로 계약 테스트는 fake 어댑터로, 실제 E2E는 가벼운 Repository 1개로만 수행.

## Out of Scope

- GitHub Webhook 자동 점검, Cron 주기 점검, CI/CD 직접 연동
- 여러 Commit 자동 비교, 고급 이미지 이력 관리, 버전별 취약점 변화 그래프
- 복잡한 Repository 구조 분석·다중 서비스 자동 매핑
- 조직/사용자 권한 관리, GitHub App/OAuth 인증, 멀티유저 인증·인가
- Public SaaS 배포 아키텍처, Kubernetes 점검, Registry push
- 실시간 CVE DB 연동, 모든 프레임워크/웹서버 완전 진단
- KISA PDF runtime 파싱, 외부 사이트 scraping
- KISA Unix 67·Web 27 전체 항목 완전 자동 점검, 표준 이미지 약 20종 전체 자동 점검
- DB 이미지 점검, 자동 보안 패치 적용
- Production-grade secret vault 연동, Windows OS 자체 점검

## Further Notes

- **구현 순서:** 전체를 얇게 연결한 뒤 확장. 첫 얇은 slice는 **C-01(root 실행)·C-02(하드코딩 시크릿)·U-16(/etc/passwd 권한)** 3개. 이후 계정/파일권한(U-01~33) → nginx 웹 항목(W-01·08·09·21·22·25·26) → httpd/tomcat 순.
- **일정:** 14일 core MVP(골격→clone/build→sandbox→ansible slice→catalog/judgement→Claude→dashboard→fallback/재점검→리허설) + 3주차 확장.
- **데모 스포트라이트:** KISA는 완전 서버 기준이라 최소 컨테이너에선 서비스·웹 항목이 대부분 `skip`이며 이는 정상. 핵심은 **계정/파일권한 축의 실제 fail 탐지 + Claude 해석 품질**이다. `검토`는 과도하게 쓰지 않는다.
- **필수 시연 성공 기준:** (1) 대시보드 입력→결과까지 무개입 E2E, (2) `debian` OS 점검 + `nginx` 웹 점검에서 실제 취약/양호 판정, (3) Ansible 증거·KISA 판정 기반으로 Claude가 읽히는 설명·위험도·조치안 생성. 그리고 PAT가 어디에도 노출되지 않음.
- **가정:** KISA 원본 자료는 팀이 PDF로 제공하고 사전 CSV/JSON으로 변환해 bundled asset으로 포함. Application code·architecture docs·domain docs는 이 PRD를 기준으로 새로 생성.
