# AI 기반 컨테이너 보안 점검 파이프라인 - MVP Spec

**작성일:** 2026-07-01
**기간:** 3주 (~7/15). 개발은 본인 단독 진행, 하루 평균 3~5h
**한 줄 요약:** GitHub 레포 → Docker 자동 빌드 → Sandbox 실행 → Ansible 보안 점검 → Claude 분석 → Web Dashboard 로 이어지는 자동 컨테이너 보안 점검 파이프라인

---

## 1. 문제 정의

**현재 상황 (보안 담당자 본인):**
- 개발팀이 올린 레포/컨테이너의 보안 설정을 **수동으로** 점검하고 있음
- 점검 항목이 사람마다·시점마다 달라 **일관성이 없음**
- Dockerfile 하드닝, 실행 중인 컨테이너의 OS baseline을 각각 따로 확인 → 느리고 누락 발생
- 점검 결과(raw 로그)를 **해석하고 개선안을 정리**하는 데 시간이 많이 듦

**해결하려는 것:**
- 레포 URL 하나만 넣으면 **빌드→실행→점검→분석까지 자동**으로 한 바퀴
- **일관된 점검 기준**(컨테이너 하드닝 + CIS baseline)을 Ansible playbook으로 고정
- Claude가 raw 결과를 **사람이 읽을 수 있는 취약점 설명·심각도·개선안**으로 변환
- 여러 레포의 점검 결과를 **대시보드에서 한눈에** 비교·관리

---

## 2. 핵심 사용자 (페르소나)

**주요 사용자:** 보안 담당자 (본인) — 도구를 직접 개발하고 직접 사용

- 여러 개발 레포의 컨테이너 보안 상태를 **혼자서** 점검·관리해야 함
- CLI 로그를 읽는 데 익숙하지만, **반복적·수동적** 점검에 지쳐 있음
- 필요한 것: "레포 넣고 → 커피 한 잔 → 정리된 리포트 확인"

> 개발도 본인 단독으로 순차 진행(개인 PC 로컬). 멀티유저·권한·협업은 이번 범위 아님 (아래 제외 범위 참고)

---

## 3. 핵심 기능 (MVP) — 5개

전체를 얇게라도 **end-to-end 한 바퀴** 도는 것이 목표. 각 단계는 "동작하는 최소 버전"으로.

> **완주 안전장치 (권장):** 항목은 아래 16개 전부를 목표로 하되, **먼저 3개(C-01·C-02·O-01)로 파이프라인을 끝까지 한 바퀴 배선**한 뒤 나머지 13개를 채운다. E2E가 최우선이므로 통합을 앞당긴다.

| # | 기능 | 설명 | 검증 |
|---|------|------|------|
| F1 | **레포 입력 & Docker 자동 빌드** | 대시보드에 GitHub URL 입력 → clone → Dockerfile 감지 → `docker build` | 유효한 Dockerfile 레포에서 이미지가 생성됨 |
| F2 | **Sandbox 격리 실행** | 빌드된 이미지를 리소스·권한 제한(네트워크 차단, `--read-only`, cap-drop, 메모리/CPU 제한, 타임아웃) 하에 실행 | 컨테이너가 격리된 채로 뜨고 점검용으로 접근 가능 |
| F3 | **Ansible 보안 점검** | 실행 중인 컨테이너 대상 Ansible playbook 실행<br>① **컨테이너/이미지 하드닝** (root 실행, 노출 포트, 하드코딩 시크릿, 위험 패키지, 불필요 setuid 등)<br>② **OS baseline (CIS 발췌)** (계정·권한·서비스·패스워드 정책 등) | playbook이 항목별 pass/fail JSON 결과를 산출 |
| F4 | **Claude API 분석** | Ansible raw 결과(JSON) → Claude → 취약점 설명·심각도(Critical/High/Med/Low)·구체적 개선안 생성 | 각 fail 항목마다 구조화된 리포트 생성 |
| F5 | **Web Dashboard** | 레포별 점검 실행 이력, 심각도 요약, 항목별 Claude 리포트를 통합 조회 | 여러 레포 결과를 목록·상세로 확인 가능 |

**점검 기준 (F3 상세):**
- 컨테이너/이미지 하드닝: Dockerfile 정적 분석 + 실행 컨테이너 점검
- OS baseline: CIS Benchmark **핵심 항목만 발췌** (전체 아님)
- playbook은 **읽기 전용 점검만** 수행, 시스템을 변경하지 않음
- 각 항목은 `{id, category, severity, status(pass/fail/skip), evidence}` 형태로 산출 → 그대로 Claude 입력
- **배포판 skip-safe 규칙:** 배포판을 사전 고정하지 않는다. O 항목은 대상 컨테이너의 배포판을 감지해 **경로·명령이 없으면 `status: skip`**(evidence에 사유 기록)으로 흘려보내고, **절대 파이프라인을 죽이지 않는다.** Claude 리포트엔 "해당 배포판에서 점검 불가"로 표시.

### 점검 체크리스트 (MVP 대상)

**① 컨테이너 / 이미지 하드닝** — Dockerfile 정적 분석(D) + 실행 컨테이너(R)

| ID | 항목 | 심각도 | 방법 | fail 기준 |
|----|------|:---:|:---:|------|
| C-01 | root(UID 0)로 실행 | High | D+R | `USER` 미지정 or 실행 UID = 0 |
| C-02 | 하드코딩 시크릿 | Critical | D | `ENV`/`ARG`에 password·token·key 패턴 |
| C-03 | 불필요한 노출 포트 | Med | D+R | 관리·DB 포트(22, 3306 등) `EXPOSE`/LISTEN |
| C-04 | base 이미지 태그 미고정 | Med | D | `:latest` 또는 태그 없음 |
| C-05 | 위험 패키지 잔존 | Med | R | curl/wget/gcc/apt 등 빌드·네트워크 도구 상주 |
| C-06 | setuid/setgid 바이너리 | High | R | 예상 외 setuid 바이너리 존재 |
| C-07 | 쓰기 가능 루트 FS | Med | R | `--read-only` 미적용 시 쓰기 가능 |
| C-08 | HEALTHCHECK 부재 | Low | D | `HEALTHCHECK` 없음 |
| C-09 | ADD 원격 사용 | Low | D | `COPY` 대신 원격 URL `ADD` |

**② OS baseline (CIS 발췌)** — 실행 컨테이너 대상(R). *배포판 감지 후 skip-safe 적용.*

| ID | 항목 | 심각도 | fail 기준 |
|----|------|:---:|------|
| O-01 | 빈 패스워드 계정 | Critical | `/etc/shadow`에 빈 password 필드 |
| O-02 | root 외 UID 0 계정 | High | `/etc/passwd`에 UID 0 중복 |
| O-03 | world-writable 파일 | High | 시스템 경로에 `o+w` 파일 존재 |
| O-04 | 민감 파일 권한 | High | `/etc/shadow` 등 권한 과다 |
| O-05 | 불필요 서비스 상주 | Med | sshd/telnet 등 미필요 데몬 실행 |
| O-06 | SSH 설정 취약 | Med | (sshd 존재 시) `PermitRootLogin yes` 등 |
| O-07 | sudoers NOPASSWD | Med | `NOPASSWD` 광범위 허용 |

> 대표 항목만 발췌. 여유 시 O-08(패스워드 정책), C-10(cap-drop 미적용) 등 확장.

---

## 4. 제외 범위 (이번엔 안 함)

> 범위가 크므로 **의도적으로** 제외. 데모 성공에 필수가 아닌 것부터 잘라냄.

- ❌ **실시간 CVE DB 연동** — 별도 spec(`spec_infra_security.md`)의 영역. 이번엔 정적/baseline 점검만
- ❌ **자동 remediation(수정 적용)** — Claude는 **개선안 제안만**, 실제 시스템 수정은 안 함
- ❌ **멀티유저 / 인증 / 권한 관리** — 본인 로컬 사용 전제, 로그인 없음
- ❌ **CI/CD 웹훅 자동 트리거·스케줄링** — 점검은 대시보드에서 **수동 실행**
- ❌ **대규모 IDC 병렬 점검** — 동시 1개 레포 처리로 충분
- ❌ **Kubernetes / 오케스트레이션 / 레지스트리 푸시** — 단일 Docker 호스트만
- ❌ **Dockerfile 없는 레포 자동 대응** — MVP는 Dockerfile 존재 레포만 지원
- ❌ **전체 CIS Benchmark 커버리지** — 대표 항목 발췌로 시연

---

## 5. 성공 기준 (시연)

시연에서 아래 **두 가지**가 모두 보이면 성공:

**A. E2E 자동 파이프라인 (라이브 데모)** ← 이번 MVP의 최우선 핵심
1. 대시보드에 준비된 GitHub 레포 URL 입력 후 "점검 시작"
2. 진행 상태가 단계별로 표시됨: `Clone → Build → Sandbox 실행 → Ansible 점검 → Claude 분석 → 완료`
3. 별도 수동 개입 없이 결과 화면까지 자동 도달 (수 분 내)

**B. Claude 분석 품질**
1. 최소 한 개 이상의 **의도적으로 심어둔 취약 설정**(예: root 실행 + 노출 포트 + 하드코딩 시크릿)을 탐지
2. 각 취약점에 대해 **심각도 + 왜 위험한지 + 구체적 개선 방법**이 사람이 읽기 좋게 출력
3. 안전하게 설정된 "좋은 레포"는 취약점이 적게 나와 **대비**가 드러남

> 데모 리스크 완화: 시연용 "취약 레포" 1개 + "안전 레포" 1개를 **사전 준비**해 대비를 보여줌

---

## 6. 기술 스택 (팀 익숙한 것 우선)

이미 Next.js 기반 프로젝트(`ax-hub-app`)이므로 대시보드는 그대로 활용. 개발은 본인 단독, 개인 PC 로컬.

| 레이어 | 선택 | 비고 |
|--------|------|------|
| **Dashboard (Frontend)** | Next.js + React (기존 프로젝트) | 레포 입력·진행 상태·결과 조회 UI |
| **Orchestration / API** | Next.js API Routes (Node/TS) | 파이프라인 단계 조율, 상태 관리 |
| **빌드 & 실행** | Docker CLI (`dockerode` 또는 shell) | `docker build` / 제한된 `docker run` |
| **Sandbox 격리** | Docker 런타임 옵션 | `--network none`, `--read-only`, `--cap-drop ALL`, `--memory`, `--pids-limit`, 타임아웃 |
| **보안 점검** | Ansible (`ansible-playbook`) | 컨테이너 하드닝 + CIS 발췌 playbook |
| **AI 분석** | Claude API — `claude-opus-4-8` (또는 비용상 `claude-sonnet-5`) | raw 결과 → 구조화 리포트, JSON 강제 출력 |
| **저장소** | SQLite (또는 로컬 JSON/파일) | 점검 이력·결과 저장. 단일 사용자라 경량 |

**환경 전제:** Docker 데몬 + Ansible 실행 가능한 로컬 환경 (Docker-in-Docker 또는 호스트 소켓 마운트). 외부 인터넷·Claude API 호출 제약 없음.

---

## 7. 아키텍처 개요

```
[사용자] 
   │ 레포 URL 입력
   ▼
[Next.js Dashboard] ──▶ [API: Pipeline Orchestrator]
                              │
        ┌─────────────────────┼───────────────────────────────┐
        ▼                     ▼                                 ▼
  1. git clone         2. docker build              3. sandbox run
                                                    (제한된 docker run)
                                                          │
                                                          ▼
                                                4. ansible-playbook
                                                 (하드닝 + CIS 점검)
                                                          │ raw JSON
                                                          ▼
                                                5. Claude API 분석
                                                 (취약점·심각도·개선안)
                                                          │
                                                          ▼
                                                [SQLite 저장] ──▶ [Dashboard 결과]
```

---

## 8. 일정 (3주 기준, 솔로 · 하루 3~5h)

> 원래 5일 골격을 3주로 확장. 앞 주에 **E2E 얇은 배선**을 끝내 통합 리스크를 앞당기고, 뒤로 갈수록 점검 항목(16개)을 채운다.

| 주차 | 목표 | verify |
|------|------|--------|
| **1주** | 레포 clone + Docker build 자동화, 파이프라인 상태 모델, Sandbox 격리 실행 골격 | 준비된 레포로 이미지 빌드·격리 실행 성공 |
| **1주 말** | Ansible 골격 + **얇은 슬라이스 3개(C-01·C-02·O-01)로 E2E 한 바퀴** (Claude·저장·화면까지 최소) | 브라우저에서 3개 항목으로 E2E 관통 |
| **2주** | 점검 항목 확장(C 전체 + O 전체, skip-safe 적용), Claude 분석 리포트 품질 다듬기 | 16개 항목 → fail별 Claude 리포트 생성 |
| **2주 말** | Dashboard: 입력·진행상태·결과 상세·이력 통합, 여러 레포 비교 뷰 | 여러 레포 결과를 목록·상세로 조회 |
| **3주** | 취약/안전 데모 레포 준비, 에러 처리·다듬기, 리허설 | 시연 시나리오 A+B 재현 |

> 버퍼가 있으면: 진행 상태 실시간 스트리밍(SSE), 심각도 대시보드 차트, O-08·C-10 등 항목 확장 순으로 추가.

---

## 9. 기술 결정 (확정) / 남은 리스크

**확정된 결정 (권장안 채택):**

- **Docker 실행 방식 → 호스트 Docker 소켓 마운트 채택.**
  대시보드/API 컨테이너에 `/var/run/docker.sock`을 마운트해 호스트 데몬으로 build/run.
  DinD보다 설정이 단순하고 데모 안정적. (소켓 마운트는 그 자체가 권한 리스크이므로 **로컬/단일 사용자 전제**에서만 사용 — 제품화 시 재검토)
- **Ansible ↔ 컨테이너 연결 → `community.docker.docker` connection plugin 채택.**
  SSH 불필요, `docker exec` 기반으로 실행 컨테이너에 직접 붙어 점검. 대상 컨테이너에 SSH·에이전트 설치 안 해도 됨.
- **Claude 출력 안정성 → structured output(tool use)로 JSON 스키마 강제.**
  `{id, severity, title, why_risky, remediation}` 스키마 고정 → 파싱 실패·환각 최소화.
- **배포판 → 사전 고정하지 않음(오는 대로 대응).** 대신 O 항목에 **skip-safe 규칙**(§3 F3) 적용 — 경로·명령 부재 시 `skip` 처리로 파이프라인이 절대 안 깨지게 함.

**남은 리스크:**

- **F3(Ansible)가 최대 리스크**: 점검 항목 16개 유지 + 배포판 미고정 + 솔로 개발이 겹침. → 완화: **얇은 슬라이스 3개로 E2E 먼저 관통**(§8) 후 항목 확장, O 항목 **skip-safe**로 배포판 편차 흡수.
- **빌드 시간**: 무거운 이미지는 데모 시간 초과 가능 → 시연 레포는 가벼운 것으로 선정, 사전 1회 빌드로 캐시 워밍
- **소켓 마운트 보안**: 위 전제(로컬·본인 사용) 벗어나면 반드시 재설계
