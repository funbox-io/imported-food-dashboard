import { FLAGS, REGION_GEO, CONFIG } from "./api.js";
import { Store } from "./store.js";

const statusLabel = { pass: "통관허용", review: "검토중", fail: "부적합" };
const statusClass = { pass: "status-pass", review: "status-review", fail: "status-fail" };

// 지도 마커 색 (Leaflet은 CSS 변수 대신 실제 색상값 필요)
const C_BLUE = "#2a78d6", C_BLUE_D = "#184f95", C_RED = "#d03b3b";

export const UI = {
  els: {},
  panels: {},
  activeTab: "overview",
  filterCountry: null,
  filterDate: "all",
  searchTerm: "",
  onRowClick: null,
  onCountryFilter: null,
  _map: null,
  _mapLayer: null,
  _lastFiltered: [],

  init({ onRowClick, onCountryFilter, onSearch, onTogglePoll }) {
    const $ = id => document.getElementById(id);
    this.els = {
      kpiRow: $("kpi-row"), body: $("table-body"), countryBar: $("country-bar"),
      search: $("search"), dateFilter: $("date-filter"),
      countTotal: $("count-total"), countNew: $("count-new"),
      statusDot: $("status-dot"), statusText: $("status-text"), lastUpdated: $("last-updated"),
      togglePoll: $("toggle-poll"), nav: $("nav"),
      listCountry: $("list-country"), listItem: $("list-item"),
      listRegion: $("list-region"), listBuyer: $("list-buyer"),
      mapNote: $("map-note"), trendChart: $("trend-chart"), trendLegend: $("trend-legend"),
      ovYearly: $("ov-yearly"), ovYearlyLegend: $("ov-yearly-legend"),
      ovCountry: $("ov-country"), ovItem: $("ov-item"), ovRecent: $("ov-recent"),
      yearlyChart: $("yearly-chart"), yearlyLegend: $("yearly-legend"), yearlyTable: $("yearly-table"),
      dataSource: $("data-source"), dataRange: $("data-range"),
      modal: $("modal"), modalTitle: $("modal-title"),
      modalBody: $("modal-body"), modalClose: $("modal-close"),
    };
    this.panels = {
      overview: $("panel-overview"), all: $("panel-all"), map: $("panel-map"),
      yearly: $("panel-yearly"), country: $("panel-country"),
      item: $("panel-item"), buyer: $("panel-buyer"), trend: $("panel-trend"),
    };
    this.onRowClick = onRowClick;
    this.onCountryFilter = onCountryFilter;
    this.els.dataSource.textContent = CONFIG.DATA_SOURCE;

    this.els.search.addEventListener("input", e => {
      this.searchTerm = e.target.value.trim().toLowerCase();
      onSearch();
    });
    this.els.dateFilter.addEventListener("change", e => {
      this.filterDate = e.target.value;
      onSearch();
    });
    this.els.togglePoll.addEventListener("click", onTogglePoll);
    this.els.modalClose.addEventListener("click", () => this.closeModal());
    this.els.modal.addEventListener("click", e => {
      if (e.target === this.els.modal) this.closeModal();
    });
    this.els.nav.querySelectorAll(".nav-btn").forEach(btn =>
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab)));
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.els.nav.querySelectorAll(".nav-btn").forEach(btn =>
      btn.classList.toggle("active", btn.dataset.tab === tab));
    for (const [key, panel] of Object.entries(this.panels))
      panel.classList.toggle("hidden", key !== tab);
    if (tab === "map") {
      this.initMap();
      this.renderMap(this._lastFiltered);
      setTimeout(() => this._map && this._map.invalidateSize(), 60);
    }
  },

  setStatus(state, text) {
    const colors = { live: "bg-green-500", error: "bg-red-500", idle: "bg-gray-400" };
    this.els.statusDot.className =
      `inline-block w-2.5 h-2.5 rounded-full ${colors[state] || colors.idle}`;
    this.els.statusText.textContent = text;
  },

  setLastUpdated(d) {
    this.els.lastUpdated.textContent = `업데이트 ${d.toLocaleTimeString("ko-KR")}`;
  },

  // ── 통합 렌더 ────────────────────────────────────────────
  render(all, { newIds, sessionNew, timeline }) {
    const filtered = this.applyFilters(all);
    this._lastFiltered = filtered;
    this.renderKpis(all, sessionNew);
    this.renderCountryBar(all);
    this.renderTable(filtered, newIds);
    this.renderCountryView(filtered);
    this.renderItemView(filtered);
    this.renderRegionView(filtered);
    this.renderBuyerView(filtered);
    this.renderTrend(timeline || []);
    this.renderMap(filtered);
    this.renderOverview(filtered, newIds);
    this.renderYearly(filtered);
    this.renderDataRange(all);
    this.els.countTotal.textContent = filtered.length;
    this.els.countNew.textContent = newIds.size;
  },

  renderKpis(all, sessionNew) {
    const total = all.length;
    const fail = all.filter(r => r.status === "fail").length;
    const failRate = total ? (fail / total * 100).toFixed(1) : "0.0";
    const countries = new Set(all.map(r => r.country)).size;

    const tile = (label, value, sub, color) => `
      <div class="card p-4">
        <div class="text-xs text-slate-500">${label}</div>
        <div class="text-3xl font-bold tabular mt-1" ${color ? `style="color:${color}"` : ""}>${value}</div>
        ${sub ? `<div class="text-xs text-slate-400 mt-0.5">${sub}</div>` : ""}
      </div>`;

    this.els.kpiRow.innerHTML =
      tile("총 신고건수", total, "누적 수신") +
      tile("세션 신규", sessionNew, "이번 접속 이후") +
      tile("부적합", fail, `부적합률 ${failRate}%`, "var(--critical)") +
      tile("수입국", countries, "국가 수");
  },

  renderDataRange(all) {
    if (!all.length) { this.els.dataRange.textContent = "데이터 기준: —"; return; }
    const dates = all.map(r => r.date).filter(Boolean).sort();
    const min = dates[0], max = dates[dates.length - 1];
    this.els.dataRange.textContent =
      `데이터 기준: ${fmtDateKo(min)} ~ ${fmtDateKo(max)} · 총 ${all.length}건`;
  },

  renderCountryBar(records) {
    const counts = {};
    records.forEach(r => counts[r.country] = (counts[r.country] || 0) + 1);
    const countries = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    this.els.countryBar.innerHTML = "";
    const makeBtn = (label, key, count) => {
      const b = document.createElement("button");
      const active = this.filterCountry === key;
      b.className = `px-3 py-1 rounded-full text-sm border ${
        active ? "text-white" : "bg-white"}`;
      b.style.borderColor = active ? "var(--brand-2)" : "var(--grid)";
      if (active) b.style.background = "var(--brand-2)";
      b.textContent = count == null ? label : `${label} ${count}`;
      b.onclick = () => {
        this.filterCountry = active ? null : key;
        this.onCountryFilter();
      };
      return b;
    };
    this.els.countryBar.appendChild(makeBtn("전체", null, null));
    countries.forEach(c =>
      this.els.countryBar.appendChild(makeBtn(`${FLAGS[c] || "🏳️"} ${c}`, c, counts[c])));
  },

  applyFilters(records) {
    const days = { today: 0, "7d": 6, "30d": 29 }[this.filterDate];
    const curYear = new Date().getFullYear();
    return records.filter(r => {
      if (this.filterCountry && r.country !== this.filterCountry) return false;
      if (this.filterDate === "year") {
        if (new Date(r.date).getFullYear() !== curYear) return false;
      } else if (days != null) {
        const diff = daysAgo(r.date);
        if (diff == null || diff < 0 || diff > days) return false;
      }
      if (this.searchTerm) {
        const hay = `${r.itemName} ${r.importer} ${r.manufacturer} ${r.category} ${r.region}`.toLowerCase();
        if (!hay.includes(this.searchTerm)) return false;
      }
      return true;
    });
  },

  renderTable(records, newIds) {
    this.els.body.innerHTML = "";
    if (!records.length) {
      this.els.body.innerHTML =
        `<tr><td colspan="5" class="px-3 py-10 text-center text-slate-400">표시할 데이터가 없습니다.</td></tr>`;
      return;
    }
    for (const r of records) {
      const geo = REGION_GEO[r.region];
      const tr = document.createElement("tr");
      tr.className = "border-t hover:bg-slate-50 cursor-pointer";
      tr.style.borderColor = "var(--grid)";
      if (newIds.has(r.id)) tr.classList.add("row-new");
      tr.onclick = () => this.onRowClick(r);

      tr.innerHTML = `
        <td class="px-3 py-2.5 whitespace-nowrap">
          <div class="tabular">${esc(r.date)}</div>
          <div class="text-xs text-slate-400">${relTime(r.date)}</div>
        </td>
        <td class="px-3 py-2.5 whitespace-nowrap">
          ${FLAGS[r.country] || "🏳️"} ${esc(r.country)}
          <div class="text-xs text-slate-400">${esc(r.port)}</div>
        </td>
        <td class="px-3 py-2.5">
          <div class="font-medium">${esc(r.itemName)}</div>
          <div class="text-xs text-slate-400">${esc(r.category)} · ${esc(r.weight)}</div>
        </td>
        <td class="px-3 py-2.5">
          <div>${esc(r.importer)}</div>
          <div class="text-xs text-slate-400">${esc(r.region)}${geo ? ` · ${esc(geo.customs)}` : ""}</div>
        </td>
        <td class="px-3 py-2.5 whitespace-nowrap">
          <span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusClass[r.status]}">
            ${statusLabel[r.status]}
          </span>
          ${r.status === "fail" && r.hazard
            ? `<div class="text-xs mt-1 font-medium" style="color:var(--critical)">⚠ ${esc(r.hazard)}</div>` : ""}
        </td>`;
      this.els.body.appendChild(tr);
    }
  },

  // ── 순위 막대 리스트 (sequential blue) ───────────────────
  renderBarList(container, groups, labelFn) {
    container.innerHTML = "";
    if (!groups.length) {
      container.innerHTML = `<div class="text-sm text-slate-400 py-4">데이터 없음</div>`;
      return;
    }
    const max = groups[0].total || 1;
    for (const g of groups) {
      const pct = Math.max(2, (g.total / max) * 100);
      const failNote = g.fail
        ? ` <span style="color:var(--critical)">· 부적합 ${g.fail}</span>` : "";
      const row = document.createElement("div");
      row.innerHTML = `
        <div class="flex justify-between items-baseline text-sm mb-1">
          <span class="truncate pr-2">${labelFn(g)}</span>
          <span class="tabular text-slate-500 whitespace-nowrap">${g.total}건${failNote}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>`;
      container.appendChild(row);
    }
  },

  renderCountryView(records) {
    this.renderBarList(this.els.listCountry, Store.aggregate(records, r => r.country),
      g => `${FLAGS[g.key] || "🏳️"} ${esc(g.key)}`);
  },
  renderItemView(records) {
    this.renderBarList(this.els.listItem, Store.aggregate(records, r => r.itemName),
      g => `<span class="font-medium">${esc(g.key)}</span>
            <span class="text-slate-400 text-xs">· ${esc(g.sample.category)}</span>`);
  },
  renderRegionView(records) {
    this.renderBarList(this.els.listRegion, Store.aggregate(records, r => r.region),
      g => `📍 ${esc(g.key)}`);
  },
  renderBuyerView(records) {
    this.renderBarList(this.els.listBuyer, Store.aggregate(records, r => r.importer),
      g => `${esc(g.key)}
            <span class="text-xs px-1.5 py-0.5 rounded"
                  style="background:var(--seq-100);color:var(--seq-600)">${esc(g.sample.region)}</span>`);
  },

  // ── 지도 (Leaflet) ───────────────────────────────────────
  initMap() {
    if (this._map || typeof L === "undefined") return;
    this._map = L.map("map", { scrollWheelZoom: false }).setView([36.3, 127.8], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, attribution: "© OpenStreetMap",
    }).addTo(this._map);
    this._mapLayer = L.layerGroup().addTo(this._map);
  },

  renderMap(records) {
    if (!this._map) return; // 지도 탭 최초 진입 시 초기화됨
    this._mapLayer.clearLayers();
    const groups = Store.aggregate(records, r => r.region);
    const max = groups.length ? groups[0].total : 1;
    for (const g of groups) {
      const geo = REGION_GEO[g.key];
      if (!geo) continue;
      const radius = 9 + (g.total / max) * 22;
      const hasFail = g.fail > 0;
      const marker = L.circleMarker([geo.lat, geo.lng], {
        radius, weight: 1.5, color: C_BLUE_D,
        fillColor: hasFail ? C_RED : C_BLUE, fillOpacity: 0.55,
      });
      marker.bindTooltip(`${g.key} ${g.total}건`, { direction: "top" });
      marker.bindPopup(
        `<b>${esc(g.key)}</b> · <b>${g.total}건</b>${hasFail ? ` · <span style="color:${C_RED}">부적합 ${g.fail}</span>` : ""}
         <br>🏛 관할 세관: ${esc(geo.customs)}
         <br>🚢 대표 반입항: ${esc(geo.port)}
         <br>📍 ${esc(geo.addr)}`);
      this._mapLayer.addLayer(marker);
    }
    this.els.mapNote.textContent = groups.length
      ? `표시 지역 ${groups.length}곳 · 마커를 클릭하면 관할 세관·반입항 위치를 볼 수 있습니다.`
      : "표시할 지역 데이터가 없습니다.";
  },

  // ── 시간대별 추이 라인 차트 (SVG + hover) ────────────────
  renderTrend(timeline) {
    const box = this.els.trendChart;
    const S1 = "var(--seq-450)", S2 = "var(--critical)";
    const swatch = (c, label) =>
      `<span class="inline-flex items-center gap-1">
         <span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>
         <span class="text-slate-600">${label}</span></span>`;
    this.els.trendLegend.innerHTML = swatch(S1, "신규 수신") + swatch(S2, "부적합");

    if (!timeline.length) {
      box.innerHTML = `<div class="text-sm text-slate-400 py-10 text-center">수신 데이터를 기다리는 중…</div>`;
      return;
    }
    const W = 820, H = 300, m = { l: 34, r: 16, t: 14, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = timeline.length;
    const xAt = i => (n === 1 ? m.l + iw / 2 : m.l + (i / (n - 1)) * iw);
    const rawMax = Math.max(1, ...timeline.map(p => Math.max(p.added, p.fail)));
    const yMax = rawMax <= 5 ? 5 : Math.ceil(rawMax / 5) * 5;
    const yAt = v => m.t + ih - (v / yMax) * ih;

    const ticks = Math.min(yMax, 5);
    let grid = "", yLabels = "";
    for (let k = 0; k <= ticks; k++) {
      const v = Math.round((yMax / ticks) * k), y = yAt(v);
      grid += `<line x1="${m.l}" y1="${y}" x2="${W - m.r}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>`;
      yLabels += `<text x="${m.l - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 6));
    let xLabels = "";
    for (let i = 0; i < n; i += step)
      xLabels += `<text x="${xAt(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${fmtHM(timeline[i].t)}</text>`;

    const path = key => timeline.map((p, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(p[key]).toFixed(1)}`).join(" ");
    const dots = (key, c) => timeline.map((p, i) =>
      `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p[key]).toFixed(1)}" r="3" fill="${c}"/>`).join("");

    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
        ${grid}${yLabels}${xLabels}
        <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${m.t + ih}" stroke="var(--baseline)" stroke-width="1"/>
        <path d="${path("added")}" fill="none" stroke="${S1}" stroke-width="2" stroke-linejoin="round"/>
        <path d="${path("fail")}"  fill="none" stroke="${S2}" stroke-width="2" stroke-linejoin="round"/>
        ${dots("added", S1)}${dots("fail", S2)}
        <line id="trend-cross" x1="0" y1="${m.t}" x2="0" y2="${m.t + ih}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" style="display:none"/>
        <rect id="trend-hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>
      </svg>
      <div id="trend-tip" style="position:absolute;display:none;pointer-events:none;background:var(--surface-1);
           border:1px solid var(--grid);border-radius:6px;padding:6px 8px;font-size:12px;
           box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap;transform:translate(-50%,-115%)"></div>`;

    const svg = box.querySelector("svg");
    const hit = box.querySelector("#trend-hit");
    const cross = box.querySelector("#trend-cross");
    const tip = box.querySelector("#trend-tip");
    hit.addEventListener("mousemove", e => {
      const rect = svg.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (W / rect.width);
      let i = Math.round(((sx - m.l) / iw) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      const p = timeline[i];
      cross.setAttribute("x1", xAt(i)); cross.setAttribute("x2", xAt(i));
      cross.style.display = "block";
      tip.style.display = "block";
      tip.style.left = `${(xAt(i) / W) * rect.width}px`;
      tip.style.top = `${(m.t / H) * rect.height + 6}px`;
      tip.innerHTML =
        `<div class="text-slate-500 mb-0.5">${fmtHMS(p.t)}</div>
         <div><span style="color:${S1}">●</span> 신규 ${p.added} · 누적 ${p.total}</div>
         <div><span style="color:${S2}">●</span> 부적합 ${p.fail}</div>`;
    });
    hit.addEventListener("mouseleave", () => { cross.style.display = "none"; tip.style.display = "none"; });
  },

  // ── 연도별 데이터 ────────────────────────────────────────
  yearGroups(records) {
    return Store.aggregate(records, r => (r.date || "").slice(0, 4))
      .filter(g => /^\d{4}$/.test(g.key))
      .sort((a, b) => a.key.localeCompare(b.key)); // 연도 오름차순
  },

  // 세로 막대 차트(정상+검토=파랑 / 부적합=빨강 스택). SVG 문자열 반환.
  yearBarsSvg(groups, { height = 240 } = {}) {
    if (!groups.length) return `<div class="text-sm text-slate-400 py-8 text-center">연도 데이터 없음</div>`;
    const W = 680, H = height, m = { l: 34, r: 12, t: 16, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = groups.length;
    const slot = iw / n, bw = Math.min(52, slot * 0.55);
    const rawMax = Math.max(1, ...groups.map(g => g.total));
    const yMax = niceMax(rawMax);
    const yAt = v => m.t + ih - (v / yMax) * ih;
    const cx = i => m.l + slot * (i + 0.5);

    let grid = "", yl = "";
    for (let k = 0; k <= 4; k++) {
      const v = Math.round((yMax / 4) * k), y = yAt(v);
      grid += `<line x1="${m.l}" y1="${y}" x2="${W - m.r}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>`;
      yl += `<text x="${m.l - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`;
    }
    let bars = "";
    for (let i = 0; i < n; i++) {
      const g = groups[i], x = cx(i) - bw / 2;
      const okH = ((g.total - g.fail) / yMax) * ih;
      const failH = (g.fail / yMax) * ih;
      const yTotalTop = yAt(g.total);
      const yFailTop = yAt(g.fail);
      // 파랑(정상·검토) 상단 세그먼트
      if (g.total - g.fail > 0)
        bars += `<rect x="${x}" y="${yTotalTop}" width="${bw}" height="${Math.max(0, okH - (failH > 0 ? 2 : 0))}" rx="3" fill="var(--seq-450)"/>`;
      // 빨강(부적합) 하단 세그먼트
      if (g.fail > 0)
        bars += `<rect x="${x}" y="${yFailTop}" width="${bw}" height="${failH}" rx="3" fill="var(--critical)"/>`;
      bars += `<text x="${cx(i)}" y="${yTotalTop - 5}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--ink-2)">${g.total}</text>`;
      bars += `<text x="${cx(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${g.key}년</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
      ${grid}${yl}
      <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${m.t + ih}" stroke="var(--baseline)" stroke-width="1"/>
      ${bars}</svg>`;
  },

  yearLegend() {
    const sw = (c, t) => `<span class="inline-flex items-center gap-1">
      <span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>
      <span class="text-slate-600">${t}</span></span>`;
    return sw("var(--seq-450)", "정상·검토") + sw("var(--critical)", "부적합");
  },

  renderYearly(records) {
    const groups = this.yearGroups(records);
    this.els.yearlyLegend.innerHTML = this.yearLegend();
    this.els.yearlyChart.innerHTML = this.yearBarsSvg(groups, { height: 300 });
    // 요약 테이블
    if (!groups.length) { this.els.yearlyTable.innerHTML = ""; return; }
    let rows = `<thead class="text-slate-500 text-left"><tr>
      <th class="py-1.5 pr-4 font-medium">연도</th>
      <th class="py-1.5 pr-4 font-medium text-right">총건수</th>
      <th class="py-1.5 pr-4 font-medium text-right">부적합</th>
      <th class="py-1.5 font-medium text-right">부적합률</th></tr></thead><tbody>`;
    for (const g of [...groups].reverse()) {
      const rate = g.total ? (g.fail / g.total * 100).toFixed(1) : "0.0";
      rows += `<tr class="border-t" style="border-color:var(--grid)">
        <td class="py-1.5 pr-4 font-medium">${g.key}년</td>
        <td class="py-1.5 pr-4 text-right tabular">${g.total}</td>
        <td class="py-1.5 pr-4 text-right tabular" style="color:var(--critical)">${g.fail}</td>
        <td class="py-1.5 text-right tabular">${rate}%</td></tr>`;
    }
    this.els.yearlyTable.innerHTML = rows + "</tbody>";
  },

  renderOverview(records, newIds) {
    // 연도별 미니 차트
    this.els.ovYearlyLegend.innerHTML = this.yearLegend();
    this.els.ovYearly.innerHTML = this.yearBarsSvg(this.yearGroups(records), { height: 220 });
    // Top 국가 / 품목
    this.renderBarList(this.els.ovCountry, Store.aggregate(records, r => r.country).slice(0, 5),
      g => `${FLAGS[g.key] || "🏳️"} ${esc(g.key)}`);
    this.renderBarList(this.els.ovItem, Store.aggregate(records, r => r.itemName).slice(0, 5),
      g => `<span class="font-medium">${esc(g.key)}</span>`);
    // 최근 신고 5건
    const recent = [...records].sort((a, b) =>
      String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id)).slice(0, 5);
    this.els.ovRecent.innerHTML = recent.length
      ? recent.map(r => `<div class="flex items-center gap-2 py-2 text-sm ${newIds.has(r.id) ? "row-new" : ""}">
          <span class="tabular text-xs text-slate-400 w-20 shrink-0">${esc(r.date)}</span>
          <span class="shrink-0">${FLAGS[r.country] || "🏳️"}</span>
          <span class="flex-1 truncate">${esc(r.itemName)} <span class="text-slate-400 text-xs">· ${esc(r.importer)}</span></span>
          <span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusClass[r.status]} shrink-0">${statusLabel[r.status]}</span>
        </div>`).join("")
      : `<div class="text-sm text-slate-400 py-4">데이터 없음</div>`;
  },

  openModal(r, stats) {
    const geo = REGION_GEO[r.region];
    this.els.modalTitle.textContent = `${r.itemName} (${r.country})`;
    const row = (k, v) => `<div class="flex justify-between border-b py-1" style="border-color:var(--grid)">
      <span class="text-slate-500">${k}</span><span class="font-medium text-right">${esc(v) || "-"}</span></div>`;
    this.els.modalBody.innerHTML =
      row("신고/수리일", `${r.date} (${relTime(r.date)})`) +
      row("수입국", `${FLAGS[r.country] || ""} ${r.country}`) +
      row("반입항", r.port) +
      row("품목분류", r.category) +
      row("품목명", r.itemName) +
      row("중량", r.weight) +
      row("수입자", r.importer) +
      row("지역", r.region) +
      row("관할 세관", geo ? geo.customs : "-") +
      row("해외제조사", r.manufacturer) +
      row("처리상태", statusLabel[r.status]) +
      (r.status === "fail" ? row("유해물질/사유", r.hazard) : "") +
      `<div class="mt-3 pt-2 text-xs text-slate-500">
        📊 동일 국가 총 ${stats.countryTotal}건 · 부적합 ${stats.countryFail}건</div>`;
    this.els.modal.classList.remove("hidden");
    this.els.modal.classList.add("flex");
  },

  closeModal() {
    this.els.modal.classList.add("hidden");
    this.els.modal.classList.remove("flex");
  },

  setPollBtn(running) {
    this.els.togglePoll.textContent = running ? "일시정지" : "재개";
  },
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g,
    m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

// 축 상한을 보기 좋은 값으로 반올림 (1/2/5 × 10^k)
function niceMax(v) {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const fmtHM  = t => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
const fmtHMS = t => new Date(t).toLocaleTimeString("ko-KR");
const fmtDateKo = s => { const d = new Date(s); return isNaN(d) ? s : `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`; };

// 신고일이 며칠 전인지 (오늘=0). 파싱 불가 시 null.
function daysAgo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const a = new Date(); a.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  return Math.round((a - d) / 86400000);
}
function relTime(dateStr) {
  const n = daysAgo(dateStr);
  if (n == null) return "";
  if (n <= 0) return "오늘";
  if (n === 1) return "어제";
  if (n < 7) return `${n}일 전`;
  if (n < 30) return `${Math.floor(n / 7)}주 전`;
  return `${Math.floor(n / 30)}개월 전`;
}
