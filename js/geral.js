// ══════════════════════════════════════════════════════════
//  GERAL — Painel Geral rendering
//  Depends on globals from helpers.js: store, goals, geralPeriod, geralWeek,
//  geralDay, setGeralPeriod, setGeralWeek, setGeralDay, buildWeeksForMonth,
//  availableMonths, monthLabel, todayKey, fmtDL, kioskDayLiq, kioskDailyGoal,
//  dailyPrizeBadge, KC, R, sK, gColor, floorPct, activeSellers,
//  kioskMonthLiq, kioskMonthGoal, kioskWeekGoal, kWeekLiq,
//  sellerMonthLiq, sellerMonthGoal, sellerWeekGoal, sellerMonthPecas,
//  sWeekLiq, sWeekPcs, kioskLastSale, showEmptyState,
//  destroyChart, chartInstances, buildPeriodToolbar, CLRS
// ══════════════════════════════════════════════════════════

function renderGeral() {
  const ks = Object.values(store.kiosks).sort((a,b) => b.liq - a.liq);
  if (!ks.length) { showEmptyState(); return; }

  const months = availableMonths();

  // Default: last month with data
  if (!geralPeriod) {
    const dm = (store.dateRange||[]).map(d=>d.slice(0,7)).sort();
    geralPeriod = dm[dm.length-1] || months[months.length-1] || months[0];
  }
  const selMonth = geralPeriod;

  // Weeks available for selected month
  const allWeeks = buildWeeksForMonth(selMonth);

  // If geralWeek not in this month's weeks, reset
  if (geralWeek && !allWeeks.find(w => w.monKey === geralWeek)) geralWeek = null;

  // Resolve period context
  const isMonth = !geralWeek;
  let wctxSel = null;
  if (!isMonth) {
    wctxSel = allWeeks.find(w => w.monKey === geralWeek);
  }
  const periodLabel = isMonth ? monthLabel(selMonth) : (wctxSel?.label||'');

  // ── Toolbar: month + week dropdowns (via buildPeriodToolbar) + day ──
  let h = buildPeriodToolbar({
    months,
    selectedMonth: selMonth,
    weeks: allWeeks,
    selectedWeek: geralWeek,
    onMonthChange: 'setGeralPeriod(this.value)',
    onWeekChange:  'setGeralWeek(this.value)'
  });

  const allDates = (store.dateRange||[]).slice().sort();

  // ── Opening Day Panel (always visible) ──────────────
  const selDayK = geralDay || todayKey();
  const selDayPrev = (() => {
    const d = new Date(selDayK+'T00:00:00');
    d.setDate(d.getDate()-1);
    return d.toISOString().slice(0,10);
  })();

  {
    // Build date list: union of sale dates + goal dates + today, newest first
    const dateSet = new Set([todayKey(), ...allDates]);
    ks.forEach(k => Object.keys(goals.kiosks[k.name]?.dailyByDate||{}).forEach(d => dateSet.add(d)));
    const sortedDays = [...dateSet].sort().reverse();

    // Ensure selDayK is in the list
    if (!dateSet.has(selDayK)) sortedDays.unshift(selDayK);

    h += `<div class="day-panel">
      <div class="day-panel-header">
        <div class="day-panel-title">◈ Abertura do Dia</div>
        <div class="day-panel-date-wrap">
          <label class="geral-month-lbl">Data</label>
          <select class="geral-month-sel" onchange="setGeralDay(this.value)" style="min-width:130px">`;
    sortedDays.forEach(d => {
      const [y,m,dd] = d.split('-');
      const lbl = `${dd}/${m}/${y.slice(2)}`;
      const isTod = d === todayKey();
      h += `<option value="${d}"${d===selDayK?' selected':''}>${lbl}${isTod?' · hoje':''}</option>`;
    });
    h += `</select></div>
      </div>`;

    // ── Row: Dia anterior ──
    h += `<div class="day-panel-row">
      <div class="day-panel-row-title">
        <div class="day-panel-row-lbl">Dia anterior</div>
        <div class="day-panel-row-date">${fmtDL(selDayPrev)}</div>
      </div>
      <div class="day-panel-cells">`;
    ks.forEach((k, ki) => {
      const kn   = k.name;
      const goal = kioskDailyGoal(kn, selDayPrev);
      const liq  = kioskDayLiq(kn, selDayPrev);
      const sup  = goal * 1.2;
      const pct  = goal>0 ? (liq/goal)*100 : 0;
      const badge= goal>0&&liq>0 ? dailyPrizeBadge(pct) : null;
      const diff = goal>0 ? liq - goal : 0;
      const kc   = KC[ki % KC.length];
      h += `<div class="day-panel-cell" style="border-top:2px solid ${kc.line}">
        <div class="day-panel-kname">${sK(kn)}</div>
        <div class="day-panel-nums">
          <div class="day-panel-num"><div class="day-panel-num-lbl">Meta</div><div class="day-panel-num-val">${goal?R(goal):'—'}</div></div>
          <div class="day-panel-num"><div class="day-panel-num-lbl">Super</div><div class="day-panel-num-val">${goal?R(sup):'—'}</div></div>
          <div class="day-panel-num"><div class="day-panel-num-lbl">Real</div><div class="day-panel-num-val" style="color:${liq&&goal?gColor(pct):'var(--text)'}">${liq?R(liq):'—'}</div></div>
          ${goal&&liq?`<div class="day-panel-num"><div class="day-panel-num-lbl">Dif.</div><div class="day-panel-num-val" style="color:${diff>=0?'var(--success)':'var(--danger)'}">${diff>=0?'+':''}${R(diff)}</div></div>`:''}
        </div>
        <div class="day-panel-foot">
          ${badge?`<span class="gbadge ${badge.cls}">${badge.label}</span>`:goal&&liq?`<span class="gbadge miss">−${floorPct(100-Math.min(pct,100))}%</span>`:''}
          ${goal&&liq?`<span class="day-panel-pct" style="color:${gColor(pct)}">${floorPct(pct)}%</span>`:''}
        </div>
      </div>`;
    });
    h += `</div></div>`;

    // ── Row: Abertura (selDayK) ──
    h += `<div class="day-panel-row day-panel-row-today">
      <div class="day-panel-row-title">
        <div class="day-panel-row-lbl">Abertura</div>
        <div class="day-panel-row-date">${fmtDL(selDayK)}</div>
      </div>
      <div class="day-panel-cells">`;
    ks.forEach((k, ki) => {
      const kn   = k.name;
      const goal = kioskDailyGoal(kn, selDayK);
      const liq  = kioskDayLiq(kn, selDayK);
      const sup  = goal * 1.2;
      const pct  = goal>0&&liq>0 ? (liq/goal)*100 : 0;
      const badge= goal>0&&liq>0 ? dailyPrizeBadge(pct) : null;
      const kc   = KC[ki % KC.length];
      h += `<div class="day-panel-cell day-panel-cell-today" style="border-top:2px solid ${kc.line}60">
        <div class="day-panel-kname">${sK(kn)}</div>
        <div class="day-panel-nums">
          <div class="day-panel-num"><div class="day-panel-num-lbl">Meta</div><div class="day-panel-num-val">${goal?R(goal):'—'}</div></div>
          <div class="day-panel-num"><div class="day-panel-num-lbl">Super</div><div class="day-panel-num-val">${goal?R(sup):'—'}</div></div>
          ${liq>0?`
          <div class="day-panel-num"><div class="day-panel-num-lbl">Real</div><div class="day-panel-num-val" style="color:${gColor(pct)}">${R(liq)}</div></div>
          <div class="day-panel-num"><div class="day-panel-num-lbl">%</div><div class="day-panel-num-val" style="color:${gColor(pct)}">${floorPct(pct)}%</div></div>`:''}
        </div>
        ${badge?`<div class="day-panel-foot"><span class="gbadge ${badge.cls}">${badge.label}</span></div>`:''}
      </div>`;
    });
    h += `</div></div>`;
    h += `</div>`;  // day-panel
  }

  h += `<div class="gc-agg-chart">
    <div class="gc-chart-lbl">Faturamento Líquido Diário · Todos os Quiosques</div>
    <div class="gc-agg-chart-canvas-wrap"><canvas id="gcd-all"></canvas></div>
  </div>`;
  h += `<div class="geral-grid">`;

  ks.forEach((k, ki) => {
    const kc = KC[ki % KC.length];  // accent color for this kiosk
    const kName   = k.name;
    const active  = activeSellers(kName);
    const nActive = active.length || Object.keys(k.sellers).length;
    const sls     = Object.values(k.sellers)
      .filter(s => !active.length || active.includes(s.name))
      .sort((a,b) => isMonth
        ? sellerMonthLiq(kName,b.name,selMonth) - sellerMonthLiq(kName,a.name,selMonth)
        : sWeekLiq(kName,b.name,wctxSel.monday,wctxSel.sunday) - sWeekLiq(kName,a.name,wctxSel.monday,wctxSel.sunday));
    const cardId  = `gc-${ki}`;

    // Card totals for selected period
    let kLiq, kGoal, kPct;
    if (isMonth) {
      kLiq  = kioskMonthLiq(kName, selMonth);
      kGoal = kioskMonthGoal(kName, selMonth);
    } else {
      kLiq  = kWeekLiq(kName, wctxSel.monday, wctxSel.sunday);
      kGoal = kioskWeekGoal(kName, geralWeek);
    }
    kPct = kGoal>0 ? (kLiq/kGoal)*100 : 0;

    h += `<div class="gc-card" style="border-color:${kc.border}">
      <div class="gc-head">
        <div>
          <div class="gc-name">${sK(kName)}</div>
          <div class="gc-sub">${nActive} vendedores · ${periodLabel}</div>
        </div>
        <div class="gc-liq">
          <div class="gc-liq-v">${R(kLiq)}</div>
          ${kGoal ? `<div class="gc-liq-goal" style="color:${gColor(kPct)}">${floorPct(kPct)}% de ${R(kGoal)}</div>` : ''}
        </div>
      </div>`;

    if (kGoal) {
      h += `<div class="gc-bar-wrap"><div class="gc-bar"><div class="gc-fill" style="width:${Math.min(kPct,100)}%;background:${gColor(kPct)}"></div></div></div>`;
    }

    // ── Seller rows (no prize badges) ──────────────────
    h += `<div class="gc-sellers${wctxSel?' gc-sellers-week':''}">
      <div class="gc-sellers-head gc-sellers-head${wctxSel?'-week':''}">
        <span>Vendedor</span>
        <span class="num">Mês</span>
        ${wctxSel?'<span class="num gc-col-week">Sem.</span>':''}
        <span class="num">Meta</span>
        <span class="num">Pçs</span>
        <span>Atingimento</span>
      </div>`;

    sls.forEach((s, si) => {
      const sLiqMonth = sellerMonthLiq(kName, s.name, selMonth);
      let sLiq, sGoal;
      if (isMonth) {
        sLiq  = sLiqMonth;
        sGoal = sellerMonthGoal(kName, selMonth);
      } else {
        sLiq  = sWeekLiq(kName, s.name, wctxSel.monday, wctxSel.sunday);
        sGoal = sellerWeekGoal(kName, geralWeek);
      }
      const sPct = sGoal>0 ? (sLiq/sGoal)*100 : 0;
      const pcs  = isMonth ? sellerMonthPecas(kName, s.name, selMonth) : sWeekPcs(kName, s.name, wctxSel?.monday, wctxSel?.sunday);
      const swGoal = wctxSel ? sellerWeekGoal(kName, geralWeek) : 0;
      const swPct  = swGoal>0 ? sLiq/swGoal*100 : 0;
      h += `<div class="gc-seller-row">
        <span class="gc-seller-name">${si===0?'<span class="star">★</span>':''}${s.name}</span>
        <span class="gc-seller-liq mo num">${R(sLiqMonth)}</span>
        ${wctxSel?`<span class="gc-seller-liq mo num gc-col-week">${R(sLiq)}</span>`:''}
        <span class="gc-seller-meta mo num">${sGoal ? R(sGoal) : '—'}</span>
        <span class="gc-seller-pcs num">${pcs}</span>
        <span class="gc-seller-goal">
          ${sGoal
            ? `<span class="gc-goal-pct" style="color:${gColor(sPct)}">${floorPct(sPct)}%</span>
               <div class="gc-mini-bar"><div class="gc-mini-fill" style="width:${Math.min(sPct,100)}%;background:${gColor(sPct)}"></div></div>`
            : '<span class="no-goal">—</span>'}
        </span>
      </div>`;
    });
    h += `</div>`;

    // ── Weekly breakdown accordion (only in month view) ─
    if (isMonth && allWeeks.length) {
      h += `<button class="gc-weeks-toggle" onclick="toggleWeeks('${cardId}')">
        <span>Ver semanas</span>
        <span class="gc-arr" id="${cardId}-arr">▸</span>
      </button>
      <div class="gc-weeks" id="${cardId}-wks">`;

      allWeeks.forEach((w, wi) => {
        const gw   = kioskWeekGoal(kName, w.monKey);
        const wLiq = kWeekLiq(kName, w.monday, w.sunday);
        const pctW = gw>0 ? (wLiq/gw)*100 : 0;

        h += `<div class="gc-week">
          <div class="gc-week-head">
            <span class="gc-week-lbl">S${wi+1} <span style="color:var(--muted)">${w.label}${w.crossMonth?' ↗':''}</span></span>
            <span class="gc-week-liq mo">${R(wLiq)}</span>
            <span class="gc-week-pct" style="color:${gw?gColor(pctW):'var(--muted)'}">${gw?floorPct(pctW)+'%':'—'}</span>
          </div>
          ${gw?`<div class="gc-mini-bar" style="margin:3px 0 8px"><div class="gc-mini-fill" style="width:${Math.min(pctW,100)}%;background:${gColor(pctW)}"></div></div>`:''}
          <div class="gc-week-sellers">`;

        sls.forEach(s => {
          const swL  = sWeekLiq(kName, s.name, w.monday, w.sunday);
          const swP  = sWeekPcs(kName, s.name, w.monday, w.sunday);
          const sgw  = sellerWeekGoal(kName, w.monKey);
          const spW  = sgw>0 ? swL/sgw*100 : 0;

          h += `<div class="gc-seller-row" style="font-size:.82rem">
            <span class="gc-seller-name">${s.name}</span>
            <span class="gc-seller-liq mo num">${R(swL)}</span>
            <span class="gc-seller-meta mo num">${sgw ? R(sgw) : '—'}</span>
            <span class="gc-seller-pcs num">${swP}</span>
            <span class="gc-seller-goal">
              ${sgw
                ? `<span class="gc-goal-pct" style="color:${gColor(spW)}">${floorPct(spW)}%</span>`
                : '<span class="no-goal">—</span>'}
            </span>
          </div>`;
        });
        h += `</div></div>`;
      });
      h += `</div>`;
    }

    // Card footer: last sale date per kiosk
    const lastSale = kioskLastSale(kName);
    // ── Daily chart per kiosk ──────────────────────────
    const cId = 'gcd-'+ki;
    h += `${lastSale?`<div class="gc-last-sale">Última venda: ${lastSale}</div>`:''}
    <div class="gc-chart-wrap">
      <div class="gc-chart-lbl">Faturamento Líquido Diário</div>
      <canvas id="${cId}" height="50"></canvas>
    </div>`;
    h += `</div>`;  // gc-card
  });

  h += `</div>`;  // geral-grid
  document.getElementById('geralBody').innerHTML = h;
  destroyChart('cBar'); destroyChart('cPie');

  // ── Aggregate chart (all kiosks, one line each) ──
  const aggId = 'gcd-all';
  destroyChart(aggId);
  const aggCanvas = document.getElementById(aggId);
  if (aggCanvas) {
    const chartDates = allDates.filter(d => d.slice(0,7) === selMonth);
    const datasets = ks.map((k,ki) => {
      const kc = KC[ki % KC.length];
      return {
        label: sK(k.name),
        data: chartDates.map(d => k.byDate?.[d]?.liq || 0),
        borderColor: kc.line,
        backgroundColor: kc.fill,
        tension: .35, fill: false,
        pointRadius: 2, borderWidth: 1.8, pointHoverRadius: 5,
      };
    });
    chartInstances[aggId] = new Chart(aggCanvas, {
      type: 'line',
      data: { labels: chartDates.map(fmtDL), datasets },
      options: {
        responsive: true, animation: false, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top',
            labels: { color:'#666', font:{family:'DM Mono',size:9}, boxWidth:10, padding:12 }
          }
        },
        scales: {
          x: { grid:{display:false}, ticks:{color:'#555',font:{family:'DM Mono',size:9},maxTicksLimit:10} },
          y: { grid:{color:'#1a1a1a'}, ticks:{color:'#555',font:{family:'DM Mono',size:9},
                 callback: v => 'R$'+v.toLocaleString('pt-BR',{notation:'compact'})} }
        }
      }
    });
  }

  // ── Per-kiosk mini charts ──
  ks.forEach((k,ki) => {
    const cId = 'gcd-'+ki;
    destroyChart(cId);
    const cv = document.getElementById(cId); if (!cv) return;
    const kc = KC[ki % KC.length];
    const dates = allDates.filter(d => d.slice(0,7) === selMonth);
    chartInstances[cId] = new Chart(cv, {
      type:'line',
      data:{
        labels: dates.map(fmtDL),
        datasets:[{
          data: dates.map(d => k.byDate?.[d]?.liq || 0),
          borderColor: kc.line,
          backgroundColor: kc.fill,
          tension:.35, fill:true, pointRadius:2, borderWidth:1.5,
        }]
      },
      options:{
        responsive:true, animation:false,
        plugins:{legend:{display:false}},
        scales:{
          x:{grid:{display:false}, ticks:{color:'#555',font:{family:'DM Mono',size:9},maxTicksLimit:7}},
          y:{grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#555',font:{family:'DM Mono',size:9},
               callback: v=>'R$'+v.toLocaleString('pt-BR',{notation:'compact'})}}
        }
      }
    });
  });
}


// Accordion toggle
function toggleWeeks(id) {
  const wks = document.getElementById(id+'-wks');
  const arr = document.getElementById(id+'-arr');
  if (!wks) return;
  const open = wks.classList.contains('open');
  wks.classList.toggle('open', !open);
  if (arr) arr.textContent = open ? '▸' : '▾';
}
