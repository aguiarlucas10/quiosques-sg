// ══════════════════════════════════════════════════════════
//  CONSOLIDADO — Admin consolidated view rendering
//  Depends on globals from helpers.js: store, goals, geralPeriod, geralWeek,
//  buildWeeksForMonth, availableMonths, monthLabel, KC, R, sK, gColor,
//  floorPct, gBar, activeSellers, kioskMonthLiq, kioskMonthPecas,
//  kioskMonthGoal, kioskWeekGoal, kWeekLiq, sellerMonthLiq, sellerMonthGoal,
//  sellerWeekGoal, sellerMonthPecas, sellerMonthDias, sWeekLiq, sWeekPcs,
//  prizeForPct, prizeForPctMonthly, destroyChart, chartInstances, CLRS,
//  buildPeriodToolbar
// ══════════════════════════════════════════════════════════

// ── SKU helpers ─────────────────────────────────────────
function getTopSkus(skus, filterKiosk, limit, sortBy) {
  // sortBy: 'revenue' (default) | 'sold' | 'avg' | 'returns'
  sortBy = sortBy || 'revenue';
  let entries = Object.entries(skus||{});
  if (filterKiosk) {
    entries = entries.filter(([,s]) => (s.byKiosk?.[filterKiosk]?.sold||0) > 0);
  }
  const sortFns = {
    revenue: ([,a],[,b]) => {
      const ar = filterKiosk ? (a.byKiosk?.[filterKiosk]?.revenue||0) : a.revenue;
      const br = filterKiosk ? (b.byKiosk?.[filterKiosk]?.revenue||0) : b.revenue;
      return br - ar;
    },
    sold: ([,a],[,b]) => {
      const as = filterKiosk ? (a.byKiosk?.[filterKiosk]?.sold||0) : a.totalSold;
      const bs = filterKiosk ? (b.byKiosk?.[filterKiosk]?.sold||0) : b.totalSold;
      return bs - as;
    },
    avg: ([,a],[,b]) => {
      const aa = a.totalSold>0 ? a.revenue/a.totalSold : 0;
      const ba = b.totalSold>0 ? b.revenue/b.totalSold : 0;
      return ba - aa;
    },
    returns: ([,a],[,b]) => (b.totalReturned||0) - (a.totalReturned||0),
  };
  entries.sort(sortFns[sortBy] || sortFns.revenue);
  return entries.slice(0, limit||50);
}

function renderSkuTable(entries, filterKiosk, opts) {
  // opts: { showKiosks, compact }
  const ks = Object.values(store.kiosks).sort((a,b)=>b.liq-a.liq).map(k=>k.name);
  const showKiosks = opts?.showKiosks && !filterKiosk;

  const sortBy = opts?.sortBy || null;
  const si = col => sortBy===col ? ' ↓' : '';
  const thSort = (col, label, cls='') => sortBy !== null
    ? `<th class="num${cls?' '+cls:''}" onclick="setSkuSort('${col}')" style="cursor:pointer;user-select:none">${label}${si(col)}</th>`
    : `<th class="num${cls?' '+cls:''}">${label}</th>`;

  let h = `<table class="sku-table"><thead><tr>
    <th>SKU</th>
    <th>Produto</th>
    ${thSort('sold','Un.')}
    ${thSort('revenue','Receita','mo')}
    ${thSort('avg','P. Médio','mo')}
    ${showKiosks ? ks.map(kn=>`<th class="num" style="font-size:.6rem">${sK(kn)}</th>`).join('') : ''}
  </tr></thead><tbody>`;

  entries.forEach(([sku, s], idx) => {
    const sold    = filterKiosk ? (s.byKiosk?.[filterKiosk]?.sold||0) : s.totalSold;
    const revenue = filterKiosk ? (s.byKiosk?.[filterKiosk]?.revenue||0) : s.revenue;
    const avg     = sold > 0 ? revenue/sold : 0;
    const rowId   = `sku-row-${idx}`;
    const detailId= `sku-det-${idx}`;

    h += `<tr class="sku-row" onclick="toggleSkuDetail('${detailId}','${sku}')" style="cursor:pointer">
      <td class="sku-code">${sku}</td>
      <td class="sku-desc">${s.desc}</td>
      <td class="num">${sold}</td>
      <td class="num mo">${R(revenue)}</td>
      <td class="num mo">${avg>0?R(avg):'—'}</td>
      ${showKiosks ? ks.map(kn=>{
        const kb = s.byKiosk?.[kn];
        return `<td class="num" style="font-size:.78rem">${kb?.sold||'—'}</td>`;
      }).join('') : ''}
    </tr>
    <tr id="${detailId}" class="sku-detail-row" style="display:none">
      <td colspan="${5+(showKiosks?ks.length:0)}" class="sku-detail-cell">
        <div class="sku-detail-inner" id="${detailId}-inner">
          <div class="sku-detail-loading">Carregando…</div>
        </div>
      </td>
    </tr>`;
  });

  h += `</tbody></table>`;
  return h;
}

function toggleSkuDetail(detailId, sku) {
  const row   = document.getElementById(detailId);
  const inner = document.getElementById(detailId+'-inner');
  if (!row) return;
  const open = row.style.display !== 'none';
  if (open) { row.style.display = 'none'; return; }
  row.style.display = '';

  // Build per-kiosk breakdown
  const s  = window._analytics?.skus?.[sku];
  if (!s) { inner.innerHTML = '<div style="color:var(--muted);font-size:.8rem;padding:8px">Sem dados analíticos</div>'; return; }

  const ks = Object.values(store.kiosks).sort((a,b)=>b.liq-a.liq).map(k=>k.name);
  let h = `<div class="sku-breakdown">
    <div class="sku-breakdown-title">
      <strong>${sku}</strong> · ${s.desc}
      · P. Tabela ${s.listPrice?R(s.listPrice):'—'}
    </div>
    <div class="sku-breakdown-grid">`;

  ks.forEach(kn => {
    const kb = s.byKiosk?.[kn];
    if (!kb?.sold && !kb?.returned) return;
    const avg = kb.sold>0 ? (kb.revenue||0)/kb.sold : 0;
    h += `<div class="sku-bk-item">
      <div class="sku-bk-name">${sK(kn)}</div>
      <div class="sku-bk-nums">
        <span>${kb.sold||0} un.</span>
        ${kb.returned ? `<span style="color:var(--danger)">−${kb.returned} dev.</span>` : ''}
        <span class="mo">${R(kb.revenue||0)}</span>
        ${avg>0?`<span style="color:var(--muted)">~${R(avg)}</span>`:''}
      </div>
    </div>`;
  });

  h += `</div></div>`;
  inner.innerHTML = h;
}

// ── SKU page state ──────────────────────────────────────
let skuPage = 0;
let skuSort = 'revenue';  // default: sort by revenue
const SKU_PAGE_SIZE = 10;

function setSkuPage(p) { skuPage = p; renderConsolidado(); }
function setSkuSort(col) { skuSort = col; skuPage = 0; renderConsolidado(); }

// ── Kiosk SKU modal ─────────────────────────────────────
function openKioskSkuModal(kName) {
  const skus = window._analytics?.skus;
  if (!skus) return;
  const top = getTopSkus(skus, kName, 10);
  if (!top.length) return;

  const modal = document.getElementById('kioskSkuModal');
  const body  = document.getElementById('kioskSkuBody');
  const title = document.getElementById('kioskSkuTitle');
  if (!modal||!body||!title) return;

  title.textContent = `Top SKUs · ${sK(kName)}`;
  body.innerHTML = renderSkuTable(top, kName, {});
  modal.classList.add('show');
}

function closeKioskSkuModal() {
  document.getElementById('kioskSkuModal')?.classList.remove('show');
}

function renderConsolidado() {
  const ks = Object.values(store.kiosks).sort((a,b) => b.liq - a.liq);
  if (!ks.length) {
    document.getElementById('consolidadoBody').innerHTML =
      '<div class="empty"><div class="ei">○</div><div class="et">Nenhum dado</div></div>';
    return;
  }

  const months = availableMonths();
  if (!geralPeriod) {
    const dm = (store.dateRange||[]).map(d=>d.slice(0,7)).sort();
    geralPeriod = dm[dm.length-1] || months[months.length-1] || months[0];
  }
  const selMonth = geralPeriod;
  const allWeeks = buildWeeksForMonth(selMonth);
  if (geralWeek && !allWeeks.find(w => w.monKey === geralWeek)) geralWeek = null;
  const isMonth  = !geralWeek;
  const wctxSel  = isMonth ? null : allWeeks.find(w => w.monKey === geralWeek);
  const periodLabel = isMonth ? monthLabel(selMonth) : (wctxSel?.label||'');

  // ── Shared filter toolbar (via buildPeriodToolbar) ──────
  let h = buildPeriodToolbar({
    months,
    selectedMonth: selMonth,
    weeks: allWeeks,
    selectedWeek: geralWeek,
    onMonthChange: 'setConsolidadoPeriod(this.value)',
    onWeekChange:  'setConsolidadoWeek(this.value)'
  });

  // ── KPI strip ──────────────────────────────────────────
  let totLiq = 0, totPecas = 0, totGoal = 0;
  ks.forEach(k => {
    if (isMonth) {
      totLiq   += kioskMonthLiq(k.name, selMonth);
      totPecas += kioskMonthPecas(k.name, selMonth);
      totGoal  += kioskMonthGoal(k.name, selMonth);
    } else {
      totLiq   += kWeekLiq(k.name, wctxSel.monday, wctxSel.sunday);
      totGoal  += kioskWeekGoal(k.name, geralWeek);
    }
  });
  if (!isMonth) {
    totPecas = ks.reduce((s,k) => {
      let p=0;
      for (const [d,v] of Object.entries(k.byDate||{})) {
        const dt=new Date(d+'T00:00:00');
        if(dt>=wctxSel.monday&&dt<=wctxSel.sunday) p+=v.pecas||0;
      }
      return s+p;
    }, 0);
  }
  const totPct = totGoal>0 ? (totLiq/totGoal)*100 : 0;
  const totS   = Object.keys(store.sellers).length;
  const tk     = totPecas>0 ? totLiq/totPecas : 0;

  h += `<div class="kpi-g">
    <div class="kpi"><div class="kpi-l">Faturamento Líquido</div><div class="kpi-v">${R(totLiq)}</div><div class="kpi-m">${periodLabel}</div></div>
    <div class="kpi"><div class="kpi-l">Meta</div><div class="kpi-v">${totGoal?R(totGoal):'—'}</div><div class="kpi-m" style="color:${totGoal?gColor(totPct):'var(--muted)'}">${totGoal?floorPct(totPct)+'%':'—'}</div></div>
    <div class="kpi"><div class="kpi-l">Ticket Médio</div><div class="kpi-v">${R(tk)}</div><div class="kpi-m">${totPecas.toLocaleString('pt-BR')} peças</div></div>
    <div class="kpi"><div class="kpi-l">Vendedores</div><div class="kpi-v">${totS}</div><div class="kpi-m">${ks.length} quiosques</div></div>
  </div>`;

  // ── Charts (month totals only) ─────────────────────────
  h += `<div class="cr">
    <div class="card"><div class="ct">Faturamento Líquido por Quiosque</div><div class="cs">${periodLabel}</div><canvas id="cBar" height="160"></canvas></div>
    <div class="card"><div class="ct">Participação</div><div class="cs">% do total líquido</div><canvas id="cPie" height="160"></canvas></div>
  </div>`;

  // ── Quiosques table ────────────────────────────────────
  h += `<div class="h2">Quiosques</div><div class="tw tw-scroll"><table><thead><tr>
    <th>Quiosque</th><th class="num">Faturamento Líquido</th><th class="num">Peças</th><th class="num">Ticket</th>
    <th>${isMonth?'Meta Mensal':'Meta Semanal'}</th>
  </tr></thead><tbody>`;
  ks.forEach(k => {
    const sc   = Object.keys(k.sellers).length;
    let kLiq, kPcs, kGoal, kTk;
    if (isMonth) {
      kLiq = kioskMonthLiq(k.name, selMonth); kPcs = kioskMonthPecas(k.name, selMonth);
      kGoal = kioskMonthGoal(k.name, selMonth);
    } else {
      kLiq = kWeekLiq(k.name, wctxSel.monday, wctxSel.sunday);
      kPcs = 0;
      for (const [d,v] of Object.entries(k.byDate||{})) {
        const dt=new Date(d+'T00:00:00');
        if(dt>=wctxSel.monday&&dt<=wctxSel.sunday) kPcs+=v.pecas||0;
      }
      kGoal = kioskWeekGoal(k.name, geralWeek);
    }
    kTk = kPcs>0 ? kLiq/kPcs : 0;
    const hasSkuData = !!window._analytics?.skus && Object.values(window._analytics.skus).some(s=>s.byKiosk?.[k.name]?.sold>0);
    h += `<tr class="${hasSkuData?'sku-kiosk-row':''}" ${hasSkuData?`onclick="openKioskSkuModal('${k.name.replace(/'/g,"\\'")}')"`:''} title="${hasSkuData?'Clique para ver top SKUs':''}">
      <td><strong>${sK(k.name)}</strong>${hasSkuData?'<span class="sku-kiosk-hint"> ↗ top SKUs</span>':''}<br><span style="font-size:.7rem;color:var(--muted)">${sc} vend.</span></td>
      <td class="mo num">${R(kLiq)}</td><td class="num">${kPcs.toLocaleString('pt-BR')}</td>
      <td class="mo num">${kTk>0?R(kTk):'—'}</td>
      <td>${gBar(kLiq, kGoal)}</td>
    </tr>`;
  });
  h += `</tbody></table></div>`;

  // ── Vendedores table ───────────────────────────────────
  const allS = Object.values(store.sellers).sort((a,b) => b.liq - a.liq);
  h += `<div class="h2">Vendedores</div><div class="tw tw-scroll"><table><thead><tr>
    <th>#</th><th>Vendedor</th><th>Quiosque</th>
    <th class="num">Faturamento Líquido</th><th class="num">Peças</th><th class="num">Dias</th><th class="num">Ticket</th>
    <th>${isMonth?'Meta Mensal':'Meta Semanal'} · Premiação</th>
  </tr></thead><tbody>`;
  let rank = 0;
  allS.forEach(s => {
    const kName = s.kiosk||'';
    const cfg   = goals.kiosks[kName]?.activeSellers?.length > 0;
    const isAct = !cfg || activeSellers(kName).includes(s.name);
    let sLiq, sPcs, sGoal;
    if (isMonth) {
      sLiq = sellerMonthLiq(kName, s.name, selMonth); sPcs = sellerMonthPecas(kName, s.name, selMonth);
      sGoal = sellerMonthGoal(kName, selMonth);
    } else {
      sLiq  = sWeekLiq(kName, s.name, wctxSel.monday, wctxSel.sunday);
      sPcs  = sWeekPcs(kName, s.name, wctxSel.monday, wctxSel.sunday);
      sGoal = sellerWeekGoal(kName, geralWeek);
    }
    const tk2 = sPcs>0 ? sLiq/sPcs : 0;
    if (cfg && !isAct) {
      h += `<tr class="inactive"><td class="rank-num">—</td><td>${s.name}<span class="tag-inactive">inativo</span></td>
        <td style="font-size:.8rem;color:var(--muted)">${sK(kName)}</td>
        <td class="mo num">${R(sLiq)}</td><td class="num">${sPcs}</td>
        <td class="num">${isMonth?sellerMonthDias(kName,s.name,selMonth):(s.dias||0)}</td><td class="mo num">${tk2>0?R(tk2):'—'}</td>
        <td>—</td>
      </tr>`;
      return;
    }
    rank++;
    const prize = isMonth ? prizeForPctMonthly(sGoal>0?(sLiq/sGoal)*100:0)
                          : prizeForPct(sGoal>0?(sLiq/sGoal)*100:0);
    h += `<tr>
      <td class="rank-num">${rank}</td><td><strong>${s.name}</strong></td>
      <td style="color:var(--muted);font-size:.8rem">${sK(kName)}</td>
      <td class="mo num">${R(sLiq)}</td><td class="num">${sPcs}</td>
      <td class="num">${isMonth?sellerMonthDias(kName,s.name,selMonth):(s.dias||0)}</td><td class="mo num">${tk2>0?R(tk2):'—'}</td>
      <td>${gBar(sLiq,sGoal)}${prize?`<span class="gbadge ${prize.label.toLowerCase()}" style="margin-left:4px">${prize.label} +R$${prize.prize}</span>`:''}</td>
    </tr>`;
  });
  h += `</tbody></table></div>`;

  // ── Top SKUs ────────────────────────────────────────
  const skusData = window._analytics?.skus;
  if (skusData && Object.keys(skusData).length) {
    const allTopSkus = getTopSkus(skusData, null, 50, skuSort);
    const totalPages = Math.ceil(allTopSkus.length / SKU_PAGE_SIZE);
    const pageStart  = skuPage * SKU_PAGE_SIZE;
    const pageEntries= allTopSkus.slice(pageStart, pageStart + SKU_PAGE_SIZE);

    h += `<div class="h2">Top Produtos</div>
    <div class="sku-section">`;
    h += renderSkuTable(pageEntries, null, { showKiosks: true, sortBy: skuSort });

    // Pagination
    if (totalPages > 1) {
      h += `<div class="sku-pagination">`;
      for (let p=0; p<totalPages; p++) {
        h += `<button class="sku-page-btn${p===skuPage?' on':''}" onclick="setSkuPage(${p})">${p*SKU_PAGE_SIZE+1}–${Math.min((p+1)*SKU_PAGE_SIZE,allTopSkus.length)}</button>`;
      }
      h += `</div>`;
    }
    h += `</div>`;
  }

  h += `<div class="meta-line">Importado em ${store.importedAt||'—'}</div>`;

  document.getElementById('consolidadoBody').innerHTML = h;
  destroyChart('cBar'); destroyChart('cPie');

  setTimeout(() => {
    const labels  = ks.map(k => sK(k.name));
    const barData = ks.map(k => isMonth ? kioskMonthLiq(k.name, selMonth) : kWeekLiq(k.name, wctxSel?.monday, wctxSel?.sunday));
    chartInstances['cBar'] = new Chart(document.getElementById('cBar'), {
      type:'bar', data:{labels,datasets:[{data:barData,backgroundColor:CLRS,borderRadius:4,borderSkipped:false}]},
      options:{responsive:true,plugins:{legend:{display:false}},scales:{
        x:{grid:{color:'#1a1a1a'},ticks:{color:'#666',font:{family:'DM Mono',size:10}}},
        y:{grid:{color:'#1a1a1a'},ticks:{color:'#666',font:{family:'DM Mono',size:10},callback:v=>'R$'+v.toLocaleString('pt-BR',{notation:'compact'})}}
      }}
    });
    chartInstances['cPie'] = new Chart(document.getElementById('cPie'), {
      type:'doughnut', data:{labels,datasets:[{data:barData,backgroundColor:CLRS,borderColor:'#000',borderWidth:2}]},
      options:{responsive:true,cutout:'62%',plugins:{legend:{position:'bottom',labels:{color:'#666',font:{family:'DM Mono',size:10},padding:14}}}}
    });
  }, 80);
}

function setConsolidadoPeriod(val) { geralPeriod = val; geralWeek = null; renderConsolidado(); }
function setConsolidadoWeek(val)   { geralWeek = val || null; renderConsolidado(); }
