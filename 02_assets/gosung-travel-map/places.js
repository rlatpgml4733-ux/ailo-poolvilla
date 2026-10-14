/* =========================================================
   우리 숙소 주변 여행하기 — 장소 데이터
   이 파일만 고치면 지도/카드 내용이 전부 바뀝니다.

   x, y : 지도 위 위치 (왼쪽 위 0,0 / 오른쪽 아래 100,100 기준 %)
   ========================================================= */

window.STAY = {
  name: "아일로 풀빌라",                // 포트폴리오용 가상 숙소
  address: "경남 고성군 대가면 ○○길 00", // 포트폴리오용 가상 주소 (핀은 대가면에 있습니다)
  x: 53.9,
  y: 46.3
};

window.PLACES = [
  {
    id: "danghangpo",
    name: "당항포관광지 (공룡세계엑스포)",
    x: 74.9, y: 37.3,
    driveMin: 29, driveKm: "12km",
    summary: "아이와 반나절 보내기 좋은 곳, 실내 전시가 있어 비 오는 날에도 괜찮아요",
    hours: "", parking: "", fee: "",
    linkLabel: "공룡세계엑스포 공식 안내",
    linkUrl: "https://www.gngsctf.or.kr/dinoexpo/index.goseong",
    photos: [{ src: "images/당항포관광지.jpg", credit: "ⓒ한국관광공사", license: "제1유형" }]
  },
  {
    id: "sangjokam",
    name: "상족암군립공원 (공룡박물관)",
    x: 16.4, y: 86.1,
    driveMin: 39, driveKm: "23km",
    summary: "공룡 발자국이 남은 바닷가 바위길, 하루를 통째로 비워 가보세요",
    hours: "", parking: "", fee: "",
    linkLabel: "네이버 지도에서 보기",
    linkUrl: "https://naver.me/5A3pHoZv",
    photos: [{ src: "images/상족암군립공원.jpg", credit: "ⓒ한국관광공사", license: "제3유형" }]
  },
  {
    id: "okcheonsa",
    name: "옥천사",
    x: 42.6, y: 25.1,
    driveMin: 37, driveKm: "12.4km",
    summary: "연화산 숲에 안긴 천년 고찰, 조용히 걷고 싶은 날에 어울려요",
    hours: "", parking: "", fee: "",
    linkLabel: "네이버 지도에서 보기",
    linkUrl: "https://naver.me/5GpoRQfZ",
    photos: [{ src: "images/옥천사.jpg", credit: "ⓒ한국관광공사", license: "제3유형" }]
  },
  {
    id: "munsuam",
    name: "문수암",
    x: 30.2, y: 59.1,
    driveMin: 21, driveKm: "13km",
    summary: "차로 올라가 바로 만나는 한려수도 전망, 맑은 날 다녀오세요",
    hours: "", parking: "", fee: "",
    linkLabel: "네이버 지도에서 보기",
    linkUrl: "https://naver.me/xprAE455",
    photos: [{ src: "images/문수암.jpg", credit: "ⓒ한국관광공사", license: "제3유형" }]
  },
  {
    id: "georyusan",
    name: "거류산 (엄홍길전시관)",
    x: 67.7, y: 60.8,
    driveMin: 17, driveKm: "6.6km",
    summary: "정상까지 오르지 않아도 좋아요, 전시관만 둘러보면 한 시간이면 충분해요",
    hours: "", parking: "", fee: "",
    linkLabel: "네이버 지도에서 보기",
    linkUrl: "https://naver.me/FHObbALn",
    photos: [
      { src: "images/거류산.jpg",     credit: "ⓒ한국관광공사", license: "제3유형" },
      { src: "images/엄홍길전시관.jpg", credit: "ⓒ한국관광공사", license: "제3유형" }
    ]
  },
  {
    id: "galmobong",
    name: "갈모봉자연휴양림",
    x: 38.8, y: 61.2,
    driveMin: 10, driveKm: "5km",
    summary: "숙소에서 가장 가까운 편백 숲길, 아침 산책으로 딱 좋아요",
    hours: "", parking: "", fee: "",
    linkLabel: "네이버 지도에서 보기",
    linkUrl: "https://naver.me/5k7ir3J6",
    photos: [{ src: "images/갈모봉자연휴양림.jpg", credit: "ⓒ한국관광공사", license: "제3유형" }]
  },
  {
    id: "songhakdong",
    name: "송학동고분군",
    x: 52.5, y: 59.2,
    driveMin: 14, driveKm: "6.3km",
    summary: "초록 능선이 펼쳐진 소가야 고분, 사진 한 장 남기기 좋은 곳",
    hours: "", parking: "", fee: "",
    linkLabel: "네이버 지도에서 보기",
    linkUrl: "https://naver.me/GZZBWMmd",
    photos: [{ src: "images/송학동고분군.jpg", credit: "ⓒ한국관광공사", license: "제1유형" }]
  },
  {
    id: "jangsansup",
    name: "장산숲",
    x: 54.4, y: 30.5,
    driveMin: 27, driveKm: "14km",
    summary: "600년 된 숲과 연못, 한여름에도 그늘이 시원한 산책로",
    hours: "", parking: "", fee: "",
    linkLabel: "네이버 지도에서 보기",
    linkUrl: "https://naver.me/G0DTTPqy",
    photos: [{ src: "images/장산숲.jpg", credit: "ⓒ한국관광공사", license: "제3유형" }]
  },
  {
    id: "namsan",
    name: "남산공원 (해지개다리)",
    x: 53.2, y: 69.6,
    driveMin: 10, driveKm: "5km",
    summary: "저녁 먹고 걷기 좋은 바다 위 산책로, 해 질 무렵이 가장 예뻐요",
    hours: "", parking: "", fee: "",
    linkLabel: "네이버 지도에서 보기",
    linkUrl: "https://naver.me/FzSRcUEQ",
    photos: [{ src: "images/남산공원.jpg", credit: "ⓒ한국관광공사", license: "제1유형" }]
  }
];

/* 첫 화면에 열려 있을 장소 id */
window.DEFAULT_PLACE = "georyusan";
