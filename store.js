// 고유 ID 기반 seen 관리 + 신규 데이터 추출
export class Store {
  constructor() {
    this.seen = new Set();      // 이미 본 ID
    this.records = new Map();   // id -> record (최신 상태 유지)
    this.timeline = [];         // 폴링 시점별 {t, added, fail, total}
  }

  // 새 배치를 받아 신규 레코드 id 목록을 반환
  ingest(batch) {
    const newIds = [];
    let addedFail = 0;
    for (const rec of batch) {
      if (!this.seen.has(rec.id)) {
        this.seen.add(rec.id);
        newIds.push(rec.id);
        if (rec.status === "fail") addedFail++;
      }
      this.records.set(rec.id, rec); // 갱신
    }
    this.timeline.push({
      t: Date.now(),
      added: newIds.length,
      fail: addedFail,
      total: this.records.size,
    });
    if (this.timeline.length > 120) this.timeline.shift(); // 최근 120포인트만 유지
    return newIds;
  }

  // 날짜 내림차순 정렬된 전체 목록
  all() {
    return [...this.records.values()].sort((a, b) =>
      String(b.date).localeCompare(String(a.date)) ||
      Number(b.id) - Number(a.id)
    );
  }

  get size() { return this.records.size; }

  // 임의의 키(국가/품목/수입자/지역 등)로 그룹 집계.
  // 반환: [{ key, total, pass, review, fail, sample }] — 건수 내림차순 정렬.
  static aggregate(records, keyFn) {
    const map = new Map();
    for (const r of records) {
      const key = keyFn(r);
      if (key == null || key === "") continue;
      let g = map.get(key);
      if (!g) { g = { key, total: 0, pass: 0, review: 0, fail: 0, sample: r }; map.set(key, g); }
      g.total++;
      g[r.status] = (g[r.status] || 0) + 1;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }
}
