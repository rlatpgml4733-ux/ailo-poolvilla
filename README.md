# 아일로 풀빌라

포트폴리오용 풀빌라 예약 사이트. 예약 검색·달력, 토스페이먼츠 결제(테스트 모드), 카카오 로그인·내 예약, 관리자 페이지(/admin), 팝업, 예약 문의.

- 실행: `.env.example` 을 `.env` 로 복사해 값을 채우고 `node dev-server.mjs` (http://localhost:8796)
- 배포: Render Blueprint (`render.yaml`). 비밀 값은 Render Environment 에만 넣는다.
- 저장: 로컬은 `data/admin-store.json`, 배포는 Upstash Redis (`UPSTASH_REDIS_REST_URL` · `UPSTASH_REDIS_REST_TOKEN`)
- 카드 정보는 저장하지 않는다. 결제 금액은 서버가 계산하고 토스 승인 API 로 다시 확인한다.
