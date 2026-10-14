# Ailo Noto Sans KR

## 포함 파일

- `NotoSansKR-Regular-Hestia.woff` — 400
- `NotoSansKR-Medium-Hestia.woff` — 500
- `NotoSansKR-Bold-Hestia.woff` — 700~900

## 확인 근거

세인트존스호텔 메인 페이지의 실제 CSS에서 `font-family: "Noto Sans Korean", sans-serif`와 100·300·350·400·500·700·900 웨이트 선언을 확인했다. 아일로에는 정보 가독성에 필요한 400·500·700만 넣었다.

## 사용 방식

- `site/index.html`의 `@font-face`로 로컬 파일을 불러온다.
- 외부 Google Fonts CSS·CDN 링크는 사용하지 않는다.
- `font-display: swap`으로 글꼴 파일이 늦게 로드돼도 본문이 보이게 한다.

## 라이선스

이 계열은 Noto CJK의 SIL Open Font License 1.1을 따른다. 전체 라이선스는 같은 폴더의 `OFL-1.1.txt`에 보관한다.
