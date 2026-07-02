# AIRPOD fallback 이미지 (airpod/fallback:local)
#
# 대상 레포 clone/build가 실패해도 파이프라인이 sandbox→evidence→판정까지
# 끝까지 진행되도록 하는 최소 "표준 베이스" 참조 이미지다 (spec §8-A-4).
# 하드닝 기준선(비-root 실행, HEALTHCHECK, 위험 도구 미설치)을 갖춰,
# fallback 스캔이 정상적인 참조 결과를 보이도록 한다.
#
# 빌드: npm run fallback:build  (또는 docker build -t airpod/fallback:local fallback)
FROM alpine:3.20

RUN addgroup -S app && adduser -S -G app app
USER app

HEALTHCHECK --interval=30s --timeout=3s CMD true

# 실제 CMD/ENTRYPOINT는 sandbox 실행 시 sleep으로 대체된다.
CMD ["sleep", "120"]
