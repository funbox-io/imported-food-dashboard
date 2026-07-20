// ==========================================================
// 설정 — 실제 배포 전 반드시 확인/교체하세요
// ==========================================================
export const CONFIG = {
  // true 이면 실제 API 호출 없이 목업 데이터로 동작 (테스트용)
  USE_MOCK: true,

  // data.go.kr 에서 발급받은 서비스 키
  SERVICE_KEY: "YOUR_SERVICE_KEY_HERE",

  // 실제 오픈 API 엔드포인트 (관세청/식약처 문서에서 확인 후 교체)
  //   ⚠ 아래 URL과 파라미터 이름은 예시입니다.
  API_BASE: "https://apis.data.go.kr/OPEN_API_PATH",

  // 브라우저 CORS 제약 회피용 프록시.
  //   ⚠ 공개 프록시는 신뢰성/보안 이슈가 있으니 가급적 본인 프록시 사용 권장.
  CORS_PROXY: "", // 예: "https://your-proxy.example.com/?url="

  PAGE_SIZE: 50,
};

// 국가 코드 → 국기 이모지 매핑 (필요시 확장)
export const FLAGS = {
  "중국": "🇨🇳", "미국": "🇺🇸", "일본": "🇯🇵", "베트남": "🇻🇳",
  "태국": "🇹🇭", "이탈리아": "🇮🇹", "프랑스": "🇫🇷", "호주": "🇦🇺",
  "독일": "🇩🇪", "스페인": "🇪🇸", "기타": "🏳️",
};

// ----------------------------------------------------------
// 응답 파싱: 실제 스키마에 맞게 매핑 함수를 수정하세요.
// 표준화된 레코드 형태:
//   { id, date, country, port, category, itemName, weight,
//     importer, manufacturer, status, hazard }
// status: "pass" | "review" | "fail"
// ----------------------------------------------------------
function normalize(raw) {
  return {
    id:           String(raw.id ?? raw.declNo ?? crypto.randomUUID()),
    date:         raw.date ?? raw.declDate ?? "",
    country:      raw.country ?? raw.orgnCd ?? "기타",
    port:         raw.port ?? raw.entryPort ?? "",
    category:     raw.category ?? raw.prductClass ?? "",
    itemName:     raw.itemName ?? raw.prductNm ?? "",
    weight:       raw.weight ?? raw.wght ?? "",
    importer:     raw.importer ?? raw.bsnmNm ?? "",
    region:       raw.region ?? raw.bsnmRegn ?? "",
    manufacturer: raw.manufacturer ?? raw.ovsMnftrNm ?? "",
    status:       mapStatus(raw.status ?? raw.processSttus),
    hazard:       raw.hazard ?? raw.hrmflChmcl ?? "",
  };
}

function mapStatus(s) {
  if (!s) return "review";
  const v = String(s);
  if (/부적합|불합격|fail/i.test(v)) return "fail";
  if (/허용|적합|수리|pass/i.test(v)) return "pass";
  return "review";
}

// ----------------------------------------------------------
// 메인 fetch 함수
// ----------------------------------------------------------
export async function fetchRecords() {
  if (CONFIG.USE_MOCK) return mockFetch();

  const params = new URLSearchParams({
    serviceKey: CONFIG.SERVICE_KEY,
    numOfRows: CONFIG.PAGE_SIZE,
    pageNo: 1,
    type: "json",
  });
  let url = `${CONFIG.API_BASE}?${params.toString()}`;
  if (CONFIG.CORS_PROXY) url = CONFIG.CORS_PROXY + encodeURIComponent(url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();

  // ⚠ 실제 응답 경로(items 위치)에 맞게 수정
  const items = data?.response?.body?.items?.item ?? data?.items ?? [];
  return (Array.isArray(items) ? items : [items]).map(normalize);
}

// ----------------------------------------------------------
// 목업 데이터 생성기 (테스트/데모용)
// ----------------------------------------------------------
// 고정 수입자(기업/개인) 풀 — 반복 등장하여 수입자·지역 집계가 의미를 갖도록 함
const IMPORTERS = [
  { name: "㈜한울무역",       region: "서울" },
  { name: "글로벌푸드코리아㈜", region: "경기" },
  { name: "부산종합식품㈜",    region: "부산" },
  { name: "대양수산㈜",        region: "부산" },
  { name: "인천항만유통㈜",    region: "인천" },
  { name: "충청농산㈜",        region: "충남" },
  { name: "영남물산㈜",        region: "경남" },
  { name: "호남식자재㈜",      region: "전남" },
  { name: "㈜서울델리마트",    region: "서울" },
  { name: "제주오션㈜",        region: "제주" },
  { name: "김수입 (개인)",     region: "경기" },
  { name: "이통상 (개인)",     region: "대구" },
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

let mockSeq = 1000;
function mockFetch() {
  const countries = Object.keys(FLAGS).filter(c => c !== "기타");
  const ports = ["인천항", "부산항", "평택항", "인천공항", "김해공항"];
  const items = [
    ["가공식품", "냉동만두"], ["농산물", "건고추"], ["수산물", "냉동새우"],
    ["주류", "레드와인"], ["과자류", "초콜릿"], ["유제품", "체다치즈"],
  ];
  const statuses = ["pass", "pass", "pass", "review", "fail"];
  const hazards = ["잔류농약 초과(클로르피리포스)", "식중독균 검출(리스테리아)", "중금속(납) 기준초과"];

  const n = 3 + Math.floor(Math.random() * 4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const st = pick(statuses);
    const [cat, name] = pick(items);
    const imp = pick(IMPORTERS);
    out.push({
      id: String(mockSeq++),
      date: new Date().toISOString().slice(0, 10),
      country: pick(countries),
      port: pick(ports),
      category: cat,
      itemName: name,
      weight: `${(Math.random() * 5000).toFixed(0)} kg`,
      importer: imp.name,
      region: imp.region,
      manufacturer: `Overseas Foods Co. #${Math.floor(Math.random() * 900 + 100)}`,
      status: st,
      hazard: st === "fail" ? pick(hazards) : "",
    });
  }
  return new Promise(r => setTimeout(() => r(out.map(normalize)), 300));
}
