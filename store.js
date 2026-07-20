// 고유 ID 기반 seen 관리 + 신규 데이터 추출
export class Store {
  constructor() {
    this.seen = new Set();      // 이미 본 ID
    this.records = new Map();   // id -> record (최신 상태 유지)
  }

  // 새 배치를 받아 신규 레코드 id 목록을 반환
  ingest(batch) {
    const newIds = [];
    for (const rec of batch) {
      if (!this.seen.has(rec.id)) {
        this.seen.add(rec.id);
        newIds.push(rec.id);
      }
      this.records.set(rec.id, rec); // 갱신
    }
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
}
