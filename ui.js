import { FLAGS } from "./api.js";
import { Store } from "./store.js";

const statusLabel = { pass: "통관허용", review: "검토중", fail: "부적합" };
const statusClass = { pass: "status-pass", review: "status-review", fail: "status-fail" };

export const UI = {
  els: {},
  panels: {},
  activeTab: "all",
  filterCountry: null,
  searchTerm: "",
  onRowClick: null,
  onCountryFilter: null,

  init({ onRowClick, onCountryFilter, onSearch, onTogglePoll }) {
    this.els = {
      kpiRow: document.getElementById("kpi-row"),
      body: document.getElementById("table-body"),
      countryBar: document.getElementById("country-bar"),
      search: document.getElementById("search"),
      countTotal: document.getElementById("count-total"),
      countNew: document.getElementById("count-new"),
      statusDot: document.getElementById("status-dot"),
      statusText: document.getElementById("status-text"),
      lastUpdated: document.getElementById("last-updated"),
      togglePoll: document.getElementById("toggle-poll"),
      tabs: document.getElementById("tabs"),
      listCountry: document.getElementById("list-country"),
      listItem: document.getElementById("list-item"),
      listRegion: document.getElementById("list-region"),
      listBuyer: document.getElementById("list-buyer"),
      trendChart: document.getElementById("trend-chart"),
      trendLegend: document.getElementById("trend-legend"),
      modal: document.getElementById("modal"),
      modalTitle: document.getElementById("modal-title"),
      modalBody: document.getElementById("modal-body"),
      modalClose: document.getElementById("modal-close"),
    };
    this.panels = {
      all: document.getElementById("panel-all"),
      country: document.getElementById("panel-country"),
      item: document.getElementById("panel-item"),
      buyer: document.getElementById("panel-buyer"),
      trend: document.getElementById("panel-trend"),
    };
    this.onRowClick = onRowClick;
    this.onCountryFilter = onCountryFilter;

    this.els.search.addEventListener("input", e => {
      this.searchTerm = e.target.value.trim().toLowerCase();
      onSearch();
    });
    this.els.togglePoll.addEventListener("click", onTogglePoll);
    this.els.modalClose.addEventListener("click", () => this.closeModal());
    this.els.modal.addEventListener("click", e => {
      if (e.target === this.els.modal) this.closeModal();
    });
    this.els.tabs.querySelectorAll(".tab-btn").forEach(btn =>
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab)));
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.els.tabs.querySelectorAll(".tab-btn").forEach(btn =>
      btn.classList.toggle("active", btn.dataset.tab === tab));
    for (const [key, panel] of Object.entries(this.panels))
      panel.classList.toggle("hidden", key !== tab);
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
    this.renderKpis(all, sessionNew);
    this.renderCountryBar(all);
    this.renderTable(filtered, newIds);
    this.renderCountryView(filtered);
    this.renderItemView(filtered);
    this.renderRegionView(filtered);
    this.renderBuyerView(filtered);
    this.renderTrend(timeline || []);
    this.els.countTotal.textContent = filtered.length;
    this.els.countNew.textContent = newIds.size;
  },

  renderKpis(all, sessionNew) {
    const total = all.length;
    const fail = all.filter(r => r.status === "fail").length;
    const failRate = total ? (fail / total * 100).toFixed(1) : "0.0";
    const countries = new Set(all.map(r => r.country)).size;

    const tile = (label, value, sub, color) => `
      <div class="bg-white rounded-lg shadow-sm p-4">
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

  renderCountryBar(records) {
    const counts = {};
    records.forEach(r => counts[r.country] = (counts[r.country] || 0) + 1);
    const countries = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    this.els.countryBar.innerHTML = "";
    const makeBtn = (label, key, count) => {
      const b = document.createElement("button");
      const active = this.filterCountry === key;
      b.className = `px-3 py-1 rounded-full text-sm border ${
        active ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-300"}`;
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
    return records.filter(r => {
      if (this.filterCountry && r.country !== this.filterCountry) return false;
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
        `<tr><td colspan="5" class="px-3 py-8 text-center text-slate-400">표시할 데이터가 없습니다.</td></tr>`;
      return;
    }
    for (const r of records) {
      const tr = document.createElement("tr");
      tr.className = "border-t hover:bg-slate-50 cursor-pointer";
      if (newIds.has(r.id)) tr.classList.add("row-new");
      tr.onclick = () => this.onRowClick(r);

      tr.innerHTML = `
        <td class="px-3 py-2 whitespace-nowrap tabular">${esc(r.date)}</td>
        <td class="px-3 py-2 whitespace-nowrap">
          ${FLAGS[r.country] || "🏳️"} ${esc(r.country)}
          <div class="text-xs text-slate-400">${esc(r.port)}</div>
        </td>
        <td class="px-3 py-2">
          <div class="font-medium">${esc(r.itemName)}</div>
          <div class="text-xs text-slate-400">${esc(r.category)} · ${esc(r.weight)}</div>
        </td>
        <td class="px-3 py-2">
          <div>${esc(r.importer)}</div>
          <div class="text-xs text-slate-400">${esc(r.region)}</div>
        </td>
        <td class="px-3 py-2 whitespace-nowrap">
          <span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusClass[r.status]}">
            ${statusLabel[r.status]}
          </span>
          ${r.status === "fail" && r.hazard
            ? `<div class="text-xs mt-1 font-medium" style="color:var(--critical)">⚠ ${esc(r.hazard)}</div>` : ""}
        </td>`;
      this.els.body.appendChild(tr);
    }
  },

  // ── 순위 막대 리스트 (sequential blue, 크기 비교) ─────────
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
    const groups = Store.aggregate(records, r => r.country);
    this.renderBarList(this.els.listCountry, groups,
      g => `${FLAGS[g.key] || "🏳️"} ${esc(g.key)}`);
  },

  renderItemView(records) {
    const groups = Store.aggregate(records, r => r.itemName);
    this.renderBarList(this.els.listItem, groups,
      g => `<span class="font-medium">${esc(g.key)}</span>
            <span class="text-slate-400 text-xs">· ${esc(g.sample.category)}</span>`);
  },

  renderRegionView(records) {
    const groups = Store.aggregate(records, r => r.region);
    this.renderBarList(this.els.listRegion, groups, g => `📍 ${esc(g.key)}`);
  },

  renderBuyerView(records) {
    const groups = Store.aggregate(records, r => r.importer);
    this.renderBarList(this.els.listBuyer, groups,
      g => `${esc(g.key)}
            <span class="text-xs px-1.5 py-0.5 rounded"
                  style="background:var(--seq-100);color:var(--seq-600)">${esc(g.sample.region)}</span>`);
  },

  // ── 시간대별 추이 라인 차트 (SVG + hover) ────────────────
  renderTrend(timeline) {
    const box = this.els.trendChart;
    const S1 = "var(--seq-450)";     // 신규 (categorical blue)
    const S2 = "var(--critical)";    // 부적합 (status red)

    // 범례 (색 단독 금지 → 라벨 병기)
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

    // y 눈금 & 그리드
    const ticks = Math.min(yMax, 5);
    let grid = "", yLabels = "";
    for (let k = 0; k <= ticks; k++) {
      const v = Math.round((yMax / ticks) * k);
      const y = yAt(v);
      grid += `<line x1="${m.l}" y1="${y}" x2="${W - m.r}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>`;
      yLabels += `<text x="${m.l - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`;
    }

    // x 라벨 (최대 6개)
    const step = Math.max(1, Math.ceil(n / 6));
    let xLabels = "";
    for (let i = 0; i < n; i += step) {
      xLabels += `<text x="${xAt(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${fmtHM(timeline[i].t)}</text>`;
    }

    const path = key => timeline.map((p, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(p[key]).toFixed(1)}`).join(" ");
    const dots = (key, c) => timeline.map((p, i) =>
      `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p[key]).toFixed(1)}" r="3" fill="${c}"/>`).join("");

    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
        ${grid}${yLabels}${xLabels}
        <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${m.t + ih}" stroke="var(--baseline,#c3c2b7)" stroke-width="1"/>
        <path d="${path("added")}" fill="none" stroke="${S1}" stroke-width="2" stroke-linejoin="round"/>
        <path d="${path("fail")}"  fill="none" stroke="${S2}" stroke-width="2" stroke-linejoin="round"/>
        ${dots("added", S1)}${dots("fail", S2)}
        <line id="trend-cross" x1="0" y1="${m.t}" x2="0" y2="${m.t + ih}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" style="display:none"/>
        <rect id="trend-hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>
      </svg>
      <div id="trend-tip" style="position:absolute;display:none;pointer-events:none;background:var(--surface-1);
           border:1px solid var(--grid);border-radius:6px;padding:6px 8px;font-size:12px;
           box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap;transform:translate(-50%,-115%)"></div>`;

    // hover 레이어
    const svg = box.querySelector("svg");
    const hit = box.querySelector("#trend-hit");
    const cross = box.querySelector("#trend-cross");
    const tip = box.querySelector("#trend-tip");
    const move = e => {
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
    };
    hit.addEventListener("mousemove", move);
    hit.addEventListener("mouseleave", () => { cross.style.display = "none"; tip.style.display = "none"; });
  },

  openModal(r, stats) {
    this.els.modalTitle.textContent = `${r.itemName} (${r.country})`;
    const row = (k, v) => `<div class="flex justify-between border-b py-1">
      <span class="text-slate-500">${k}</span><span class="font-medium text-right">${esc(v) || "-"}</span></div>`;
    this.els.modalBody.innerHTML =
      row("신고/수리일", r.date) +
      row("수입국", `${FLAGS[r.country] || ""} ${r.country}`) +
      row("반입항", r.port) +
      row("품목분류", r.category) +
      row("품목명", r.itemName) +
      row("중량", r.weight) +
      row("수입자", r.importer) +
      row("지역", r.region) +
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

const fmtHM  = t => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
const fmtHMS = t => new Date(t).toLocaleTimeString("ko-KR");
