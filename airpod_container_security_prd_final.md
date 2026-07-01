# PRD: AIRPOD AI 기반 컨테이너 보안 점검 파이프라인 (최종본)

**문서 상태:** 최종 통합 PRD  
**작성일:** 2026-07-01  
**대상 기간:** 14일 핵심 MVP + 3주차 안정화/확장  
**개발 조건:** 단독 개발, 하루 평균 3~5시간  
**제품명:** AIRPOD MVP  
**핵심 목표:** GitHub Repository 기반 Docker 이미지 보안 점검을 수동 반복 작업에서 재현 가능한 End-to-End 자동 점검 흐름으로 전환한다.

---

## 1. 결론 요약

AIRPOD MVP는 보안 담당자가 Web Dashboard에서 GitHub Repository URL, Branch, GitHub PAT를 입력하고 점검 대상 Docker 이미지를 선택하면, 최신 Commit 기준으로 이미지를 빌드하고, 제한된 Docker Sandbox에서 실행한 뒤, Ansible 기반 점검과 KISA 기준 판정, Claude API 기반 설명 생성을 거쳐 Dashboard에서 결과를 확인할 수 있게 하는 컨테이너 보안 점검 파이프라인이다.

MVP의 필수 시연 성공 기준은 다음 세 가지다.

1. **대시보드 입력 → 결과 확인까지 무개입 End-to-End 자동 도달**
2. **`debian` OS 기준 점검 + `nginx` 웹 이미지 점검에서 실제 취약/양호 판정 확인**
3. **Ansible 증거와 KISA 룰 판정을 기반으로 Claude가 사람이 읽기 쉬운 설명·위험도·조치안을 생성**

전체 플랫폼, CI/CD 자동화, 멀티유저 권한관리, Kubernetes 점검, 모든 KISA 항목의 완전 자동화는 MVP 범위가 아니다.

---

## 2. 문제 정의

보안 담당자는 GitHub Repository에 있는 Docker 이미지가 배포 가능한 보안 기준을 만족하는지 매번 수동으로 빌드, 실행, 점검, 분석해야 한다.

이 과정에는 다음 문제가 있다.

- Repository마다 점검 기준과 실행 방식이 달라 결과의 일관성이 떨어진다.
- Dockerfile 하드닝과 실행 컨테이너의 OS/Web 보안 설정을 따로 확인해야 해서 시간이 오래 걸리고 누락이 생긴다.
- private Repository의 Dockerfile 또는 표준 이미지 정의 파일을 확인하고, 최신 Commit 기준으로 이미지를 빌드한 뒤, 컨테이너 환경에서 점검 기준을 적용하는 과정이 반복된다.
- Ansible 또는 명령 실행 결과는 raw 로그 형태라서 보안 담당자가 직접 취약점 의미, 위험도, 조치방안을 해석해야 한다.
- 여러 Repository와 여러 이미지의 보안 상태를 한 곳에서 비교·관리하기 어렵다.
- 데모나 검증 중 GitHub API, clone, Docker Build가 실패하면 전체 흐름이 중단될 위험이 있다.

---

## 3. 목표

### 3.1 제품 목표

AIRPOD MVP는 다음 흐름을 하나의 수동 점검 요청으로 연결한다.

```text
Repository 입력
→ Repository 접근 검증
→ Dockerfile/이미지 후보 발견
→ Docker Build
→ Docker Sandbox 실행
→ Ansible 점검
→ KISA 기준 판정
→ Claude AI 설명 생성
→ Dashboard 결과 확인
→ 재점검
```

### 3.2 MVP 목표

MVP는 전체 자동화 플랫폼이 아니라, 보안 담당자가 Dashboard에서 수동으로 점검을 요청하고 결과를 확인할 수 있는 **End-to-End 보안 점검 흐름**을 완성하는 데 집중한다.

핵심 범위는 다음과 같다.

- 필수 점검 대상: `debian`, `nginx`
- 선택 확장 대상: `httpd`, `tomcat`
- 제외 대상: DB 이미지, 전체 표준 이미지 약 20종, Kubernetes, CI/CD 자동 트리거, 자동 패치
- 필수 점검 방식: Docker Build + Sandbox 실행 + Ansible 점검 + KISA 룰 판정 + Claude 분석 + Dashboard 표시
- 데모 안정성 장치: 이미 빌드된 로컬 Docker Image를 선택해 점검 흐름을 계속하는 fallback 경로

---

## 4. 사용자와 주요 시나리오

### 4.1 핵심 사용자

**보안 담당자**

- 여러 Repository와 Docker 이미지를 점검해야 한다.
- Dockerfile, OS 설정, 웹서버 설정, 취약점 의미를 모두 직접 확인하기에는 시간이 부족하다.
- raw 로그보다 사람이 읽기 쉬운 리포트와 조치 예시가 필요하다.
- private Repository 접근을 위해 PAT를 사용할 수 있지만, 토큰 노출은 피해야 한다.

**개발자 / 구현자**

- MVP를 단독 개발해야 한다.
- Docker, Ansible, Claude API, Dashboard를 빠르게 연결해야 한다.
- 테스트 가능한 adapter boundary와 fallback 경로가 필요하다.

**데모 운영자**

- 발표 중 외부 네트워크, GitHub, Docker Build 실패에도 핵심 흐름을 보여줘야 한다.
- 취약한 이미지와 안전한 이미지의 결과 차이를 명확하게 보여줘야 한다.

---

## 5. 핵심 사용자 스토리

### 5.1 Repository 입력과 접근 검증

1. 보안 담당자로서, GitHub Repository URL을 입력해 점검을 시작하고 싶다.
2. 보안 담당자로서, private Repository에 접근할 수 있도록 GitHub PAT를 입력하고 싶다.
3. 보안 담당자로서, PAT가 점검 작업 중에만 사용되고 장기 평문 저장되지 않기를 원한다.
4. 보안 담당자로서, PAT가 로그, Dashboard 결과, AI 분석 payload에서 마스킹되기를 원한다.
5. 보안 담당자로서, Branch를 선택할 수 있고 기본값은 `main`이기를 원한다.
6. 보안 담당자로서, Repository URL, Branch, PAT가 유효한지 점검 진행 전에 확인하고 싶다.

### 5.2 이미지 후보 발견과 Build

7. 보안 담당자로서, Repository 파일 구조에서 Dockerfile 또는 표준 이미지 정의 후보가 자동 감지되기를 원한다.
8. 보안 담당자로서, 감지된 이미지 후보 목록을 보고 점검 대상을 선택하고 싶다.
9. 보안 담당자로서, `nginx` 또는 `debian` 이미지 후보를 선택해 MVP 필수 대상을 점검하고 싶다.
10. 보안 담당자로서, 시간이 허용될 경우 `httpd`, `tomcat`도 같은 흐름으로 점검하고 싶다.
11. 보안 담당자로서, 선택한 이미지를 최신 Commit 기준으로 빌드하고 싶다.
12. 보안 담당자로서, 빌드된 이미지에 Commit SHA 기반 버전 태그가 붙어 점검 결과를 소스 상태와 연결하고 싶다.
13. 보안 담당자로서, Dockerfile이 없거나 Build가 실패하면 실패 원인을 명확히 보고 싶다.

### 5.3 Fallback 경로

14. 보안 담당자로서, GitHub API, clone, Docker Build가 실패해도 이미 빌드된 로컬 Docker Image를 선택해 데모를 계속하고 싶다.
15. 보안 담당자로서, fallback 점검도 동일한 Ansible, KISA 판정, Claude 분석, Dashboard 표시 흐름을 사용하길 원한다.

### 5.4 Sandbox 실행

16. 보안 담당자로서, 선택한 이미지가 제한된 Docker Sandbox에서 실행되기를 원한다.
17. 보안 담당자로서, Sandbox 실행에 CPU 제한, 메모리 제한, 프로세스 제한, 실행 시간 제한이 적용되기를 원한다.
18. 보안 담당자로서, 실행이 끝난 컨테이너가 자동으로 제거되기를 원한다.
19. 보안 담당자로서, 가능한 범위에서 네트워크 차단, 읽기 전용 파일시스템, capability drop이 적용되기를 원한다.
20. 보안 담당자로서, 점검 도구가 SSH 없이 컨테이너에 붙어 대상 컨테이너를 불필요하게 변형하지 않기를 원한다.

### 5.5 Ansible 점검과 KISA 판정

21. 보안 담당자로서, Dockerfile과 실행 컨테이너에 대해 컨테이너/이미지 하드닝 항목이 점검되기를 원한다.
22. 보안 담당자로서, 실행 컨테이너에 대해 KISA Unix 서버 점검 항목이 적용되기를 원한다.
23. 보안 담당자로서, 컨테이너가 웹서버를 포함하면 KISA 웹서비스 점검 항목도 적용되기를 원한다.
24. 보안 담당자로서, 대상 컨테이너에 해당 파일, 서비스, 데몬이 없으면 오류가 아니라 `skip`으로 처리되기를 원한다.
25. 보안 담당자로서, 점검 결과가 `{id, category, severity, status, evidence}` 구조로 산출되기를 원한다.
26. 보안 담당자로서, 명확한 증거가 있으면 `양호` 또는 `취약`으로 판정되고, 증거가 부족하거나 환경 의존적인 경우에만 `검토`가 사용되기를 원한다.
27. 보안 담당자로서, 아직 자동화되지 않은 KISA 항목도 카탈로그에는 보이되 자동 판정에서는 제외되기를 원한다.

### 5.6 Claude AI 분석

28. 보안 담당자로서, Ansible 결과와 KISA 룰 판정 결과가 민감정보 제거 후 Claude API에 전달되기를 원한다.
29. 보안 담당자로서, Claude API가 보안 기준 자체를 만들거나 판정을 대체하지 않기를 원한다.
30. 보안 담당자로서, Claude가 취약점 설명, 위험도, 판정 근거, 원인, 조치방안, 설정 예시를 생성하길 원한다.
31. 보안 담당자로서, Claude 출력이 고정 JSON 스키마로 제공되어 Dashboard가 안정적으로 파싱할 수 있기를 원한다.

### 5.7 Dashboard

32. 보안 담당자로서, 점검 진행 상태를 `Clone → Build → Sandbox → Ansible → KISA 판정 → Claude → 완료` 단계로 보고 싶다.
33. 보안 담당자로서, 이미지 수, Build 상태, 점검 상태, 취약점 통계 요약 카드를 보고 싶다.
34. 보안 담당자로서, 이미지별 점검 결과 목록을 보고 여러 이미지를 비교하고 싶다.
35. 보안 담당자로서, 상세 화면에서 개별 KISA 항목, evidence, AI 설명, 조치 예시를 보고 싶다.
36. 보안 담당자로서, `양호`와 `취약` 결과가 Dashboard에서 명확하게 강조되기를 원한다.
37. 보안 담당자로서, `검토`와 `skip` 항목이 과도한 노이즈가 되지 않도록 분리 표시되기를 원한다.
38. 보안 담당자로서, 동일 이미지에 대해 재점검을 실행하고 이전 점검 이력도 유지하고 싶다.

---

## 6. 기능 요구사항

### 6.1 Repository 입력

Dashboard는 다음 입력값을 제공해야 한다.

| 필드 | 필수 여부 | 기본값 | 설명 |
|---|---:|---|---|
| Repository URL | 필수 | 없음 | GitHub Repository URL |
| Branch | 선택 | `main` | 점검할 Branch |
| GitHub PAT | 조건부 필수 | 없음 | private Repository 접근용 |
| Image candidate | 필수 | 자동 감지 후 선택 | Dockerfile 또는 표준 이미지 정의 후보 |
| Fallback local image | 선택 | 없음 | GitHub/Build 실패 시 사용할 로컬 이미지 |

### 6.2 Repository 접근 검증

- GitHub API 또는 clone 전 단계에서 Repository 접근 가능 여부를 확인한다.
- Branch 존재 여부를 확인한다.
- PAT가 필요한 Repository에서 PAT가 없거나 잘못된 경우 명확한 오류를 제공한다.
- PAT는 점검 작업의 실행 컨텍스트에서만 사용하고 장기 평문 저장하지 않는다.

### 6.3 이미지 후보 발견

- Repository 파일 트리를 검사해 Dockerfile 후보를 찾는다.
- 최소 지원 후보:
  - 루트 `Dockerfile`
  - 하위 디렉터리 `*/Dockerfile`
  - `docker-compose.yml`에 정의된 build context
- MVP 필수 후보:
  - `debian`
  - `nginx`
- 선택 후보:
  - `httpd`
  - `tomcat`
- DB 이미지와 기타 표준 이미지 전체 자동 매핑은 MVP에서 제외한다.

### 6.4 Docker Build

- 선택된 Dockerfile 또는 build context를 최신 Commit 기준으로 build한다.
- Build 결과 이미지는 Commit SHA 기반 태그를 가진다.
- Build 상태는 Dashboard에 표시한다.
- Build 실패 시 다음 정보를 저장한다.
  - 실패 단계
  - 실패 메시지
  - 관련 stderr 일부
  - fallback 가능 여부

### 6.5 Docker Sandbox 실행

Sandbox 실행은 다음 제한을 기본으로 한다.

| 제한 | MVP 기본 방향 |
|---|---|
| Network | 가능하면 `--network none` |
| Filesystem | 가능하면 `--read-only` |
| Capability | `--cap-drop ALL` 우선 |
| CPU | CPU quota 또는 CPU shares 제한 |
| Memory | 메모리 제한 |
| PID | `--pids-limit` |
| Timeout | 실행 시간 제한 |
| Cleanup | 종료 후 컨테이너 자동 제거 |

단, 일부 점검 항목이 컨테이너 내부 파일을 읽어야 하므로, 읽기 전용 파일시스템이나 네트워크 차단이 특정 이미지 동작을 깨는 경우 MVP 데모 안정성을 우선한다. 완화가 필요한 경우 Dashboard 또는 로그에 제한 완화 사유를 남긴다.

### 6.6 Ansible 점검

- Ansible 실행은 `ansible-runner` 또는 equivalent runner를 통해 Python worker에서 수행한다.
- 컨테이너 연결은 SSH 에이전트 설치 방식이 아니라 Docker exec 기반 연결을 우선한다.
- 점검 playbook은 유지보수 가능한 rule unit으로 분리한다.
- Ansible 원본 결과는 JSON으로 수집한다.
- 점검은 읽기 전용이어야 하며 대상 컨테이너 설정을 변경하지 않는다.

### 6.7 점검 결과 표준 스키마

각 점검 항목은 다음 공통 스키마로 정규화한다.

```json
{
  "id": "C-01",
  "domain": "container",
  "category": "container_hardening",
  "title": "root(UID 0) 실행",
  "severity": "High",
  "status": "fail",
  "ui_status": "취약",
  "evidence": "Container runs as UID 0",
  "reason": "USER directive is missing and runtime UID is 0",
  "remediation": "Dockerfile에 USER 지시어를 추가하고 non-root 계정으로 실행한다.",
  "applicability": "applicable",
  "automation_status": "automated"
}
```

### 6.8 상태값 정의

내부 상태와 UI 표시값은 분리한다.

| 내부 status | UI 표시 | 의미 |
|---|---|---|
| `pass` | `양호` | 명확한 증거로 기준을 만족함 |
| `fail` | `취약` | 명확한 증거로 기준을 위반함 |
| `review` | `검토` | 증거가 부족하거나 환경 의존적이라 자동 판정이 어려움 |
| `skip` | `제외` 또는 `해당 없음` | 대상 컨테이너에 해당 파일·서비스·데몬이 없어 점검 대상이 아님 |
| `not_automated` | `자동화 전` | 카탈로그에는 있으나 MVP 자동 판정 대상이 아님 |

중요한 원칙은 다음과 같다.

- `skip`은 실패가 아니다.
- `review`는 자동 판정 실패가 아니라 수동 검토가 필요한 상태다.
- 명확한 evidence가 있으면 `review`보다 `pass` 또는 `fail`을 우선한다.
- 아직 자동화되지 않은 항목은 자동 판정 통계에서 제외한다.

---

## 7. 점검 기준

### 7.1 최종 기준

MVP 점검 기준은 다음 세 가지 축으로 구성한다.

1. **컨테이너/이미지 하드닝 9개 항목**
2. **KISA 주요정보통신기반시설 Unix 서버 점검 67개 항목**
3. **KISA 주요정보통신기반시설 웹서비스 점검 27개 항목**

총 카탈로그 기준은 **103개 항목**이다.

> 이전 문서의 WEB 26개 표기는 상세 항목 목록 기준으로 WEB 27개(W-01~W-27)로 정리한다.

### 7.2 카탈로그 관리

KISA 기준은 runtime에 PDF를 파싱하지 않는다. 사전 변환된 CSV 또는 JSON 카탈로그로 애플리케이션에 포함한다.

각 카탈로그 항목은 최소 다음 필드를 가진다.

| 필드 | 설명 |
|---|---|
| `id` | C-01, U-01, W-01 형식 |
| `domain` | container, unix, web |
| `title` | 점검 항목명 |
| `description` | 기준 설명 |
| `severity` | Critical, High, Medium, Low |
| `kisa_severity` | 상, 중, 하 |
| `container_applicability` | 적용 가능, 부분 적용, 해당 없음, 추후 검토 |
| `automation_status` | automated, partial, not_automated |
| `judgement_rule` | 자동 판정 기준 |
| `remediation` | 조치 방향 |
| `target` | debian, nginx, httpd, tomcat 등 |

### 7.3 심각도 매핑

| KISA 등급 | MVP severity |
|---|---|
| 상 | High |
| 중 | Medium |
| 하 | Low |
| 명백한 secret, token, 빈 패스워드, UID 0 등 고위험 컨테이너 항목 | Critical 상향 가능 |

### 7.4 컨테이너/이미지 하드닝 항목

| ID | 항목 | 심각도 | 방법 | fail 기준 |
|---|---|---:|---|---|
| C-01 | root(UID 0) 실행 | High | Dockerfile + Runtime | `USER` 미지정 또는 실행 UID=0 |
| C-02 | 하드코딩 시크릿 | Critical | Dockerfile | `ENV`/`ARG`에 password, token, key 패턴 |
| C-03 | 불필요한 노출 포트 | Medium | Dockerfile + Runtime | 관리/DB 포트(22, 3306 등) `EXPOSE` 또는 LISTEN |
| C-04 | base 이미지 태그 미고정 | Medium | Dockerfile | `latest` 또는 태그 없음 |
| C-05 | 위험 패키지 잔존 | Medium | Runtime | curl, wget, gcc, package manager 등 불필요 패키지 |
| C-06 | setuid/setgid 바이너리 | High | Runtime | 예상 외 setuid/setgid 바이너리 |
| C-07 | 쓰기 가능 루트 FS | Medium | Runtime | read-only rootfs 미적용 또는 쓰기 가능 |
| C-08 | HEALTHCHECK 부재 | Low | Dockerfile | `HEALTHCHECK` 없음 |
| C-09 | 원격 URL ADD 사용 | Low | Dockerfile | `ADD http(s)://...` 사용 |

### 7.5 KISA Unix 서버 항목

- 범위: U-01~U-67
- 주요 영역:
  - 계정 관리 U-01~U-13
  - 파일 및 디렉터리 관리 U-14~U-33
  - 서비스 관리 U-34~U-63
  - 패치 관리 U-64
  - 로그 관리 U-65~U-67
- MVP 자동화 우선순위:
  1. U-16 `/etc/passwd` 파일 소유자 및 권한
  2. U-18 `/etc/shadow` 파일 소유자 및 권한
  3. U-05 root 이외 UID 0 금지
  4. U-10 동일 UID 금지
  5. U-14 root 홈 및 PATH 권한
  6. U-23 SUID/SGID/Sticky bit 점검
  7. U-25 world writable 파일 점검
  8. U-01~U-13 계정 관리 확장
  9. U-34~U-67 서비스/패치/로그 항목은 skip-safe 우선 적용 후 단계적 자동화

### 7.6 KISA 웹서비스 항목

- 범위: W-01~W-27
- Apache/IIS 중심 항목은 카탈로그에 포함한다.
- Linux 컨테이너에서 IIS 항목(W-11~W-19)은 대부분 `skip` 처리한다.
- `nginx`는 MVP 필수 대상이므로, KISA 웹서비스 항목 중 일반 웹서버 설정으로 매핑 가능한 항목부터 적용한다.
- `httpd`, `tomcat`은 선택 확장 대상이다.

우선 자동화 후보는 다음과 같다.

| ID | 항목 | MVP 적용 방향 |
|---|---|---|
| W-01 | 디렉터리 리스팅 제거 | nginx/httpd 설정 확인 |
| W-08 | 웹서비스 로그 설정 | 로그 설정 존재 여부 확인 |
| W-09 | 웹서버 에러 메시지 통제 | server_tokens/error page 등 확인 |
| W-21 | 웹서버 데몬 실행 권한 제한 | 웹 프로세스 실행 사용자 확인 |
| W-22 | 웹 서비스 환경설정 파일 보호 | 설정 파일 소유자/권한 확인 |
| W-25 | 불필요한 HTTP Method 제한 | TRACE 등 위험 method 제한 확인 |
| W-26 | 헤더 정보 노출 제한 | version/banner 노출 확인 |
| W-27 | 웹서버 최신 보안 패치 및 업데이트 | 패키지 버전 evidence 수집, 자동 판정은 제한적 |

---

## 8. Claude AI 분석 요구사항

### 8.1 AI 사용 원칙

Claude API는 보안 기준을 생성하지 않는다. Claude API는 Ansible evidence와 KISA 기반 rule judgement를 사람이 이해하기 쉬운 설명으로 바꾸는 역할만 한다.

즉, 신뢰 경계는 다음 순서다.

```text
Ansible evidence
→ KISA rule judgement
→ Claude explanation
→ Dashboard display
```

Claude 출력이 deterministic rule judgement를 약화시키면 안 된다.

예:

- 룰 판정이 `fail`이면 Claude가 임의로 `pass`로 바꾸면 안 된다.
- 룰 판정이 `pass`이면 Claude가 근거 없이 취약점으로 만들면 안 된다.
- evidence가 부족한 경우에만 `review` 설명을 생성한다.

### 8.2 AI 입력 Sanitization

Claude API로 전달하기 전 다음 항목을 제거 또는 마스킹한다.

- GitHub PAT
- token, secret, password, key 패턴
- private Repository URL에 포함된 인증정보
- 환경변수 중 민감 패턴
- 로그 중 Authorization header
- SSH key, private key, certificate secret
- 내부 IP/hostname은 필요 시 마스킹 옵션 적용

### 8.3 Claude 출력 스키마

Claude 분석 결과는 다음 스키마를 따른다.

```json
{
  "id": "C-01",
  "status": "fail",
  "severity": "High",
  "title": "컨테이너가 root 사용자로 실행됨",
  "evidence": "Container runtime UID is 0",
  "reason": "root 권한으로 실행되는 컨테이너는 침해 시 호스트 자원 접근 위험이 커질 수 있다.",
  "remediation": "Dockerfile에 non-root 사용자를 생성하고 USER 지시어로 전환한다.",
  "example": "RUN useradd -r appuser\nUSER appuser"
}
```

### 8.4 AI 실패 처리

- Claude API 호출 실패 시 전체 점검을 실패 처리하지 않는다.
- AI 분석 상태만 `ai_failed`로 표시하고, Ansible/KISA 원본 판정은 Dashboard에서 그대로 확인 가능해야 한다.
- fallback 또는 재분석 기능은 선택 사항이다.

---

## 9. Dashboard 요구사항

### 9.1 화면 구성

MVP Dashboard는 다음 화면을 포함한다.

1. **Scan Request 화면**
   - Repository URL 입력
   - Branch 입력
   - PAT 입력
   - 이미지 후보 탐색
   - 점검 시작
   - 로컬 이미지 fallback 선택

2. **Progress 화면**
   - Clone
   - Build
   - Sandbox
   - Ansible
   - KISA 판정
   - Claude
   - 완료/실패

3. **Summary 화면**
   - 총 이미지 수
   - Build 성공/실패
   - 점검 성공/실패
   - Critical/High/Medium/Low 수
   - `양호`/`취약`/`검토`/`skip` 수

4. **Image Result List 화면**
   - Repository
   - Branch
   - Commit SHA
   - Image tag
   - Last scan status
   - Vulnerability summary
   - 재점검 버튼

5. **Scan Detail 화면**
   - 항목별 결과
   - KISA ID
   - 제목
   - severity
   - status
   - evidence
   - Claude 설명
   - 조치 예시

6. **Catalog 화면 또는 상세 탭**
   - 전체 KISA 카탈로그
   - 자동화 여부
   - 컨테이너 적용 가능성
   - not_automated 항목 확인

### 9.2 표시 원칙

- `취약`은 가장 눈에 띄게 표시한다.
- `양호`는 통과 근거를 확인할 수 있게 표시한다.
- `검토`는 자동 증거 부족 또는 환경 의존으로 설명한다.
- `skip`은 최소화된 컨테이너 특성상 정상일 수 있음을 명확히 표시한다.
- not_automated 항목은 “범위 투명성”을 위해 보여주되 취약점 통계에는 넣지 않는다.

---

## 10. 아키텍처 결정

### 10.1 최종 선택

MVP 아키텍처는 다음을 기준으로 한다.

```text
React/Vite Dashboard
        ↓
FastAPI Backend
        ↓
Celery Worker + Redis
        ↓
GitHub Adapter / Docker Adapter / Ansible Runner / Claude Adapter
        ↓
SQLite
```

### 10.2 선택 이유

기존 PRD에는 Next.js API Routes 기반 단일 오케스트레이터 안이 있었지만, 최종본에서는 FastAPI + Celery + Redis 구조를 채택한다.

이유는 다음과 같다.

- Docker SDK for Python, ansible-runner, 보안 점검 orchestration이 Python 생태계와 더 잘 맞는다.
- Build, Sandbox, Ansible, Claude 분석은 장시간 작업이므로 API 서버와 worker를 분리하는 구조가 안정적이다.
- Redis + Celery는 scan job 상태 추적에 단순하면서도 충분하다.
- React/Vite Dashboard는 SSR 없이 빠르게 구현 가능하다.
- adapter boundary를 두면 GitHub, Docker, Ansible, Claude를 fake로 대체해 테스트하기 쉽다.

단, 팀 또는 Repository 상황상 Next.js를 이미 사용 중이라면 Frontend만 Next.js로 유지할 수 있다. 이 경우에도 Docker/Ansible orchestration은 Python backend/worker로 분리하는 것을 권장한다.

### 10.3 주요 컴포넌트

| 컴포넌트 | 역할 |
|---|---|
| Frontend | 점검 요청, 진행 상태, 결과 목록, 상세 결과 표시 |
| FastAPI | REST API, OpenAPI 문서, scan job 생성 및 조회 |
| Celery Worker | clone, build, sandbox, ansible, Claude 분석 실행 |
| Redis | Celery broker, job 상태 중간 저장 |
| SQLite | MVP persistence |
| GitHub Adapter | Repository 접근 검증, 파일 트리 조회, clone |
| Docker Adapter | build, run, exec, cleanup, resource limit |
| Ansible Adapter | ansible-runner 실행, JSON 수집 |
| Claude Adapter | sanitized 결과 분석 요청, structured JSON 수신 |
| Catalog Loader | KISA CSV/JSON 로드 |
| Judgement Engine | evidence 기반 pass/fail/review/skip 판정 |

### 10.4 Docker 실행 방식

- 로컬 MVP에서는 호스트 Docker daemon을 사용한다.
- Docker socket 접근은 강한 권한을 가지므로 로컬 단일 사용자/데모 전제로만 허용한다.
- 제품화 시 별도 worker isolation, rootless Docker, VM sandbox, Kubernetes job 등으로 재설계한다.

---

## 11. 데이터 모델 초안

### 11.1 Repository

| 필드 | 설명 |
|---|---|
| `id` | Repository ID |
| `url` | GitHub Repository URL |
| `default_branch` | 기본 Branch |
| `created_at` | 생성일 |

### 11.2 ImageCandidate

| 필드 | 설명 |
|---|---|
| `id` | 후보 ID |
| `repository_id` | Repository 참조 |
| `path` | Dockerfile 또는 compose path |
| `image_type` | debian, nginx, httpd, tomcat, unknown |
| `is_required_target` | 필수 대상 여부 |

### 11.3 ScanJob

| 필드 | 설명 |
|---|---|
| `id` | Job ID |
| `repository_id` | Repository 참조 |
| `branch` | Branch |
| `commit_sha` | Commit SHA |
| `image_candidate_id` | 후보 참조 |
| `fallback_image` | fallback local image |
| `status` | pending/running/succeeded/failed |
| `current_stage` | clone/build/sandbox/ansible/judgement/ai/done |
| `error_message` | 실패 메시지 |
| `created_at` | 생성일 |
| `finished_at` | 종료일 |

### 11.4 BuildAttempt

| 필드 | 설명 |
|---|---|
| `id` | Build ID |
| `scan_job_id` | Job 참조 |
| `image_tag` | Commit SHA 기반 tag |
| `status` | succeeded/failed |
| `log_excerpt` | Build 로그 일부 |

### 11.5 ScanFinding

| 필드 | 설명 |
|---|---|
| `id` | Finding ID |
| `scan_job_id` | Job 참조 |
| `rule_id` | C-01/U-16/W-01 등 |
| `domain` | container/unix/web |
| `severity` | Critical/High/Medium/Low |
| `status` | pass/fail/review/skip/not_automated |
| `evidence` | 점검 근거 |
| `reason` | 판정 이유 |
| `remediation` | 기본 조치안 |

### 11.6 AiAnalysis

| 필드 | 설명 |
|---|---|
| `id` | AI 분석 ID |
| `finding_id` | Finding 참조 |
| `status` | succeeded/failed |
| `analysis_json` | Claude structured output |
| `error_message` | 실패 시 메시지 |

---

## 12. 구현 순서

### 12.1 핵심 원칙

먼저 전체 기능을 얇게 연결한 뒤 점검 항목을 확장한다.

가장 먼저 구현할 얇은 slice는 다음 3개다.

| 항목 | 이유 |
|---|---|
| C-01 root 실행 | 컨테이너 보안 데모 효과가 큼 |
| C-02 하드코딩 시크릿 | Dockerfile 정적 분석 데모 효과가 큼 |
| U-16 `/etc/passwd` 권한 | KISA Unix 항목 대표로 적합 |

### 12.2 14일 MVP 일정

| 기간 | 목표 | 산출물 |
|---|---|---|
| Day 1~2 | 프로젝트 골격 | FastAPI, Worker, Redis, SQLite, React/Vite, Docker Compose |
| Day 3~4 | Repository 입력/clone/build | GitHub Adapter, Dockerfile 후보 탐색, Build 상태 |
| Day 5~6 | Sandbox 실행 | Docker run 제한, timeout, cleanup |
| Day 7~8 | Ansible 얇은 slice | C-01, C-02, U-16 결과 JSON |
| Day 9~10 | KISA catalog + judgement | CSV/JSON 로드, pass/fail/review/skip 판정 |
| Day 11 | Claude 분석 | sanitized payload, structured output |
| Day 12 | Dashboard 결과 | summary/list/detail |
| Day 13 | fallback + 재점검 | 로컬 이미지 fallback, scan history |
| Day 14 | 데모 리허설/버그 수정 | 취약 레포/안전 레포 비교 시연 |

### 12.3 3주차 확장

| 우선순위 | 확장 항목 |
|---|---|
| 1 | 계정/파일권한 U-01~U-33 확대 |
| 2 | nginx 웹 항목 W-01, W-08, W-09, W-21, W-22, W-25, W-26 |
| 3 | httpd/tomcat 선택 지원 |
| 4 | SSE 기반 진행 상태 실시간 스트리밍 |
| 5 | 심각도 차트 및 비교 화면 개선 |

---

## 13. 테스트 전략

### 13.1 최고 테스트 경계

가장 중요한 테스트 seam은 **Scan Job Orchestrator API**다.

테스트는 내부 함수 구현보다 다음 외부 동작을 검증한다.

```text
Repository URL 입력
→ 이미지 후보 발견
→ Build 또는 fallback
→ Sandbox 실행
→ Ansible 결과 수집
→ KISA 판정
→ Claude 분석
→ 저장
→ Dashboard 조회 결과
```

### 13.2 테스트 종류

| 테스트 | 목적 |
|---|---|
| Primary E2E flow test | 필수 대상 성공 경로 검증 |
| Vulnerable fixture test | 심어둔 취약 항목이 fail로 나오는지 검증 |
| Safe fixture test | 안전 이미지에서 대부분 pass 또는 skip으로 나오는지 검증 |
| GitHub fake adapter test | Repository metadata, file tree, commit 반환 검증 |
| Docker fake adapter test | Build, run, resource limit, cleanup 호출 검증 |
| Ansible fake runner test | 대표 JSON 결과 정규화 검증 |
| Claude fake adapter test | sanitized payload와 structured output 검증 |
| KISA catalog test | U-01~U-67, W-01~W-27 로드 및 metadata 유지 검증 |
| Judgement test | 명확한 evidence는 pass/fail, 불충분 evidence는 review 검증 |
| Skip-safe test | NFS, SNMP, IIS 등 미존재 항목이 skip 처리되는지 검증 |
| PAT leakage test | 로그, AI payload, DB, Dashboard에 PAT가 없는지 검증 |
| Fallback test | GitHub/Build 실패 후 로컬 이미지로 남은 흐름이 성공하는지 검증 |
| Re-scan test | 동일 이미지 재점검 시 이전 이력이 손상되지 않는지 검증 |

### 13.3 비결정성 격리

- 실제 GitHub, Docker Build, Claude 호출은 느리고 비결정적이다.
- 계약 검증 테스트에서는 fake adapter를 사용한다.
- 실제 E2E는 준비된 가벼운 Repository 1개로만 수행한다.
- 데모용 Repository는 취약 레포 1개, 안전 레포 1개를 준비한다.

---

## 14. 보안 요구사항

### 14.1 Secret 처리

- PAT는 장기 평문 저장 금지
- 로그 출력 금지
- AI payload 전송 금지
- Dashboard 응답 포함 금지
- 에러 메시지에 포함 금지
- DB 저장 시 저장 자체를 피하거나, 불가피하면 암호화/즉시 폐기

### 14.2 Sandbox 보안

- 네트워크 차단 우선
- read-only filesystem 우선
- cap-drop 우선
- resource limit 필수
- timeout 필수
- cleanup 필수
- Docker socket 사용은 로컬 단일 사용자 MVP 전제에서만 허용

### 14.3 AI 신뢰 경계

- AI는 기준 생성자가 아니다.
- AI는 판정자가 아니다.
- AI는 설명 생성자다.
- 최종 판정의 근거는 Ansible evidence와 KISA judgement다.

---

## 15. 성공 기준

### 15.1 기능 성공 기준

MVP는 다음이 가능하면 성공이다.

1. Dashboard에서 GitHub Repository URL, Branch, PAT를 입력한다.
2. Repository 접근 검증이 수행된다.
3. Dockerfile 또는 이미지 후보가 표시된다.
4. `debian` 또는 `nginx` 이미지를 선택한다.
5. 최신 Commit 기준으로 Docker Build가 실행된다.
6. Build된 이미지가 제한된 Sandbox에서 실행된다.
7. Ansible 점검 결과가 JSON으로 수집된다.
8. KISA 카탈로그 기반 판정이 생성된다.
9. Claude가 fail/review 항목에 대해 설명과 조치방안을 생성한다.
10. Dashboard에서 summary, list, detail 결과를 확인한다.
11. 재점검을 실행할 수 있다.
12. GitHub/Build 실패 시 로컬 이미지 fallback으로 핵심 흐름을 시연할 수 있다.

### 15.2 데모 성공 기준

- 취약 레포에서는 C-01, C-02, U-16 등 심어둔 취약점이 `취약`으로 표시된다.
- 안전 레포에서는 동일 항목이 `양호` 또는 합리적인 `skip`으로 표시된다.
- Dashboard에서 취약/양호 차이가 명확히 보인다.
- Claude 설명은 raw 로그보다 이해하기 쉽고 조치 가능한 형태다.
- PAT가 어디에도 노출되지 않는다.

---

## 16. 제외 범위

다음은 MVP에서 제외한다.

- GitHub Webhook 기반 자동 점검
- Cron Scheduler 기반 주기적 점검
- CI/CD 파이프라인 직접 연동
- 여러 Commit 간 자동 비교
- 고급 이미지 이력 관리
- 복잡한 Repository 구조 분석 및 다중 서비스 자동 매핑
- 버전별 취약점 변화 그래프
- 조직/사용자 권한 관리
- GitHub App 또는 OAuth 기반 인증
- 멀티유저 인증/인가
- Public SaaS deployment architecture
- Kubernetes 환경 점검
- Registry push
- 실시간 CVE DB 연동
- 모든 프레임워크/웹서버에 대한 완전한 보안 진단
- KISA PDF runtime 파싱
- 외부 사이트 scraping
- KISA OS/Unix 67개, WEB 27개 전체 항목의 완전 자동 점검
- 실제 표준 이미지 약 20개 전체 자동 점검
- DB 이미지 보안 점검
- 자동 보안 패치 적용
- Production-grade secret vault integration
- Windows OS 자체 점검

---

## 17. 리스크와 완화책

| 리스크 | 설명 | 완화책 |
|---|---|---|
| 점검 항목 과다 | C 9 + U 67 + W 27로 총 103개 | C-01/C-02/U-16 얇은 slice 먼저 구현 |
| KISA 항목의 컨테이너 부적합 | KISA는 완전한 서버 기준 | container_applicability와 skip-safe 적용 |
| 서비스 항목 대량 skip | 최소 컨테이너에는 NFS, SNMP, FTP, Telnet 등이 없음 | skip을 정상 상태로 설명하고 통계 분리 |
| Docker Build 실패 | Repository 구조, network, dependency 문제 | 로컬 이미지 fallback 제공 |
| Claude API 실패 | 외부 API 불안정 | AI 실패와 점검 실패를 분리 |
| PAT 노출 | 로그/AI payload/DB 유출 위험 | sanitizer + 보안 테스트 필수 |
| Docker socket 권한 | 호스트 권한 리스크 | 로컬 단일 사용자 MVP 전제, 제품화 시 재설계 |
| 단독 개발 시간 부족 | 하루 3~5시간 | 14일 core MVP + 3주차 확장으로 분리 |
| Dashboard 과부하 | pass/fail/review/skip/not_automated가 섞임 | 상태별 필터와 summary 분리 |

---

## 18. 추가 참고 사항

- MVP는 `검토`를 과도하게 사용하지 않아야 한다.
- 결정론적 evidence가 있으면 `양호` 또는 `취약` 판정을 우선한다.
- `skip`은 최소화된 컨테이너에서는 정상적으로 많이 발생할 수 있다.
- 데모의 핵심 스포트라이트는 계정/파일권한 축의 실제 fail 탐지와 Claude 해석 품질이다.
- KISA 원본 자료는 팀이 PDF로 제공하고, 사전에 CSV 또는 JSON으로 변환해 bundled asset으로 포함한다고 가정한다.
- 로컬 이미지 fallback은 선택 기능이 아니라 데모 안정성을 위한 MVP 필수 기능이다.
- Application code, architecture docs, domain docs는 이 PRD를 기준으로 새로 생성한다.

---

## 19. 최종 결정 요약

| 항목 | 최종 결정 |
|---|---|
| 제품 범위 | 수동 점검 요청 기반 컨테이너 보안 점검 MVP |
| 필수 대상 | `debian`, `nginx` |
| 선택 대상 | `httpd`, `tomcat` |
| Backend | FastAPI |
| Worker | Celery |
| Queue/Broker | Redis |
| Frontend | React SPA with Vite |
| DB | SQLite |
| Docker 제어 | Docker SDK for Python |
| Ansible 실행 | ansible-runner |
| AI | Claude API |
| KISA 기준 | Unix 67 + Web 27 |
| 카탈로그 | Static CSV/JSON |
| 핵심 상태 | pass/fail/review/skip/not_automated |
| UI 상태 | 양호/취약/검토/제외/자동화 전 |
| 데모 안전장치 | 로컬 Docker Image fallback |
| 첫 구현 slice | C-01, C-02, U-16 |
