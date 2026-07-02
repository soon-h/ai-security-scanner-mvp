# AIRPOD — 컨테이너 보안 점검 파이프라인 (Slice 1)

GitHub 레포 → Docker 빌드 → Sandbox 실행 → Ansible 점검 → 가이드 기반 룰 평가 → Claude 분석 → Dashboard로 이어지는 자동 컨테이너 보안 점검 파이프라인의 **첫 tracer bullet(Slice 1, GitHub issue #26)**.

3개 항목(**C-01** root 실행 / **C-02** 하드코딩 시크릿 / **U-16** `/etc/passwd` 권한)으로 전체 파이프라인을 end-to-end 관통한다.

## 실행

```bash
cd airpod
npm install
npm run dev
# http://localhost:3000
```

레포 URL 입력 → "점검 시작" → 진행 상태가 단계별로 표시되고 결과 화면까지 자동 도달한다.

## 런타임 executor

런타임 점검은 `RuntimeExecutor` 인터페이스로 추상화되어 있다 (`src/lib/executor/`).

- **DockerExecutor** — 실제 `docker build` / 격리 `docker run`(`--network none --read-only --cap-drop ALL --memory --pids-limit`).
- **StubExecutor** — Docker 미설치 시 자동 사용. evidence의 `source`가 `stub`으로 표기되어 실제 점검과 구분된다.

선택 로직은 `AIRPOD_EXECUTOR` 환경변수로 제어한다: `auto`(기본, docker 가용 시 docker) / `docker` / `stub`.
Docker 설치 후 오케스트레이터·점검 로직 변경 없이 그대로 실제 executor로 승격된다.

## Claude 분석

- `ANTHROPIC_API_KEY` 설정 시 실제 Claude API로 fail/review 항목 리포트를 생성한다(모델 기본값 `claude-sonnet-5`, `ANTHROPIC_MODEL`로 변경).
- 키가 없거나 호출 실패 시 결정적 stub 리포트로 대체한다. **AI 실패는 점검 실패와 분리**되어 점검 결과는 유지된다.
- Claude 입력은 항상 sanitize된다 (PAT·token·secret·URL 인증정보·Authorization·SSH 키 등). `src/lib/analysis/sanitize.ts`.
- Claude는 룰 평가 status를 바꾸지 않고 evidence 설명만 한다 (spec §6).

## 신뢰 경계 (spec §6)

```
Ansible evidence → 가이드 기반 룰 평가 → Claude explanation → Dashboard display
```

> 표시되는 평가 결과는 KISA가 직접 판정한 것이 아니라, 가이드 기반 점검 항목과 Ansible evidence로 시스템이 산출한 가이드 기반 점검 결과다.

## 구조

```
src/
  app/                     # 대시보드(입력·이력) + 상세(진행상태·결과) + API routes
  lib/
    catalog.ts             # C-01, C-02, U-16 정적 카탈로그
    types.ts               # status/CheckResult/ScanRecord
    store.ts               # 로컬 JSON 저장 (data/scans/*.json)
    executor/              # RuntimeExecutor 추상화 (stub/docker)
    analysis/              # dockerfile 정적분석, rules, sanitize, claude
    pipeline/              # repo clone, orchestrator
```
