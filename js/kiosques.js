// ══════════════════════════════════════════════════════════
//  KIOSQUES — Quiosques tab rendering
//  Depends on globals from helpers.js: store, goals, geralPeriod, geralWeek,
//  setGeralPeriod, setGeralWeek, buildWeeksForMonth, availableMonths,
//  monthLabel, KC, R, sK, gColor, floorPct, activeSellers,
//  kioskMonthLiq, kioskMonthPecas, kioskMonthGoal, kioskWeekGoal,
//  kWeekLiq, sellerMonthLiq, sellerMonthGoal, sellerWeekGoal,
//  sellerMonthPecas, sWeekLiq, sWeekPcs, prizeForPct, prizeForPctMonthly,
//  destroyChart, chartInstances, fmtDL, buildPeriodToolbar
// ══════════════════════════════════════════════════════════

window._kqSel = window._kqSel || {};

function renderKiosques() {
  try {
  if (!geralPeriod) {
    const dm = (store.dateRange||[]).map(d=>d.slice(0,7)).sort();
    geralPeriod = dm[dm.length-1] || '';
  }
  const selMonth = geralPeriod;
  const months   = [...new Set((store.dateRange||[]).map(d=>d.slice(0,7)))].sort();
  const allWeeks = buildWeeksForMonth(selMonth);
  if (geralWeek && !allWeeks.find(w => w.monKey === geralWeek)) geralWeek = null;
  const wctx  = geralWeek ? allWeeks.find(w => w.monKey === geralWeek) : null;
  const wKey  = wctx?.monKey || '';

  // Init seller selection state if not set
  if (!window._kqSel) window._kqSel = {};

  const ks = Object.values(store.kiosks).sort((a,b) =>
    kioskMonthLiq(b.name, selMonth) - kioskMonthLiq(a.name, selMonth));
  if (!ks.length) {
    document.getElementById('kiosquesBody').innerHTML =
      '<div class="empty"><div class="ei">○</div><div class="et">Nenhum dado</div></div>';
    return;
  }

  // ── Toolbar (via buildPeriodToolbar) ──────────────────
  let h = buildPeriodToolbar({
    months,
    selectedMonth: selMonth,
    weeks: allWeeks,
    selectedWeek: geralWeek,
    onMonthChange: 'setGeralPeriod(this.value)',
    onWeekChange:  'setGeralWeek(this.value)'
  });

  ks.forEach((k, ki) => {
    const kName  = k.name;
    const kc     = KC[ki % KC.length];
    const kLiqM  = kioskMonthLiq(kName, selMonth);
    const kPcsM  = kioskMonthPecas(kName, selMonth);
    const gm     = kioskMonthGoal(kName, selMonth);
    const gw     = kioskWeekGoal(kName, wKey);
    const wLiq   = wctx ? kWeekLiq(kName, wctx.monday, wctx.sunday) : 0;
    const pM     = gm>0 ? Math.min((kLiqM/gm)*100,100) : 0;
    const pW     = gw>0 ? Math.min((wLiq/gw)*100,100) : 0;
    const tk     = kPcsM > 0 ? kLiqM/kPcsM : 0;

    // Active sellers only
    const activeSel  = activeSellers(kName);
    const hasCfg     = activeSel.length > 0;
    const sls = Object.values(k.sellers)
      .filter(s => !hasCfg || activeSel.includes(s.name))
      .sort((a,b) => (wctx
        ? sWeekLiq(kName,b.name,wctx.monday,wctx.sunday) - sWeekLiq(kName,a.name,wctx.monday,wctx.sunday)
        : sellerMonthLiq(kName,b.name,selMonth) - sellerMonthLiq(kName,a.name,selMonth)));

    // Check if inactive sellers have sales in period
    const inactSales = hasCfg ? Object.values(k.sellers)
      .filter(s => !activeSel.includes(s.name))
      .reduce((sum,s) => sum + (wctx
        ? sWeekLiq(kName,s.name,wctx.monday,wctx.sunday)
        : sellerMonthLiq(kName,s.name,selMonth)), 0) : 0;

    // Init selection: all active sellers selected by default
    const selKey = `${ki}`;
    if (!window._kqSel[selKey]) {
      window._kqSel[selKey] = new Set(sls.map(s=>s.name));
      if (inactSales > 0) window._kqSel[selKey].add('__inact__');
    }
    const selSet = window._kqSel[selKey];

    // ── Kiosk card ───────────────────────────────────
    h += `<div class="kiosk-section" style="border-top:3px solid ${kc.line}20">
      <div class="ks-header">
        <div>
          <div class="ks-name">${sK(kName)}</div>
          <div class="ks-sub">${kName} · ${sls.length} vendedor${sls.length!==1?'es':''} ativo${sls.length!==1?'s':''}</div>
        </div>
        <div class="ks-total">
          <div class="ks-total-lbl">${wctx?'Semana':'Mês'} · ${wctx?wctx.label:monthLabel(selMonth)}</div>
          <div class="ks-total-val">${R(wctx?wLiq:kLiqM)}</div>
        </div>
      </div>`;

    // ── Goal blocks (weekly primary) ─────────────────
    if (gw || gm) {
      h += `<div class="ks-goals">`;
      if (gw) {
        h += `<div class="ks-goal-item">
          <div class="ks-goal-lbl">Meta Semanal${wctx?' · '+wctx.label:''}</div>
          <div class="ks-goal-row">
            <span class="ks-goal-val">${R(wLiq)}</span>
            <span class="ks-goal-pct" style="color:${gColor(pW)}">${floorPct(pW)}%</span>
          </div>
          <div class="ks-goal-sub">de ${R(gw)}</div>
          <div class="ks-goal-bar"><div class="ks-goal-fill" style="width:${Math.min(pW,100)}%;background:${gColor(pW)}"></div></div>
        </div>`;
      }
      if (gm) {
        h += `<div class="ks-goal-item">
          <div class="ks-goal-lbl">Meta Mensal · ${monthLabel(selMonth)}</div>
          <div class="ks-goal-row">
            <span class="ks-goal-val">${R(kLiqM)}</span>
            <span class="ks-goal-pct" style="color:${gColor(pM)}">${floorPct(pM)}%</span>
          </div>
          <div class="ks-goal-sub">de ${R(gm)}</div>
          <div class="ks-goal-bar"><div class="ks-goal-fill" style="width:${Math.min(pM,100)}%;background:${gColor(pM)}"></div></div>
        </div>`;
      }
      h += `</div>`;
    }

    // ── Stat pills ───────────────────────────────────
    h += `<div class="ks-stats">
      <div class="ks-stat"><div class="ks-stat-l">Peças ${wctx?'Sem.':'Mês'}</div><div class="ks-stat-v">${(wctx ? Object.values(k.sellers).reduce((s,sl)=>s+sWeekPcs(kName,sl.name,wctx.monday,wctx.sunday),0) : kPcsM).toLocaleString('pt-BR')}</div></div>
      <div class="ks-stat"><div class="ks-stat-l">Ticket Médio</div><div class="ks-stat-v">${tk>0?R(tk):'—'}</div></div>
      ${gw&&wctx?`<div class="ks-stat"><div class="ks-stat-l">vs Meta Sem.</div><div class="ks-stat-v" style="color:${gColor(pW)}">${floorPct(pW)}%</div></div>`:''}
    </div>`;

    // ── Seller cards ─────────────────────────────────
    h += `<div class="ks-sellers-lbl">Vendedores</div><div class="ks-sellers">`;

    sls.forEach((s, si) => {
      const sLiqM  = sellerMonthLiq(kName, s.name, selMonth);
      const swL    = wctx ? sWeekLiq(kName, s.name, wctx.monday, wctx.sunday) : 0;
      const sgw    = sellerWeekGoal(kName, wKey);
      const sgm    = sellerMonthGoal(kName, selMonth);
      const spW    = sgw>0 ? swL/sgw*100 : 0;
      const spM    = sgm>0 ? sLiqM/sgm*100 : 0;
      const prizeW = sgw>0 ? prizeForPct(spW) : null;
      const isSel  = selSet.has(s.name);
      const displayLiq = wctx ? swL : sLiqM;
      const displayPct = wctx ? spW : spM;
      const displayGoal= wctx ? sgw : sgm;

      h += `<div class="ks-seller-card${isSel?'':' ks-sc-dimmed'}"
        onclick="kqToggleSeller(${ki},'${s.name.replace(/'/g,"\\'")}',${JSON.stringify([...selSet])})"
        style="cursor:pointer;border-color:${isSel?kc.border:'var(--border)'}">
        <div class="ks-sc-head">
          <span class="ks-sc-name">${si===0?'<span class="star">★</span>':''}${s.name}</span>
          <span class="ks-sc-pcs">${wctx ? sWeekPcs(kName,s.name,wctx.monday,wctx.sunday) : sellerMonthPecas(kName,s.name,selMonth)} pçs</span>
        </div>
        <div class="ks-sc-liq">${R(displayLiq)}</div>`;

      // Show weekly goal primarily, monthly as secondary
      if (sgw) {
        h += `<div class="ks-sc-goal">
          <div class="ks-sc-goal-row">
            <span style="font-size:.6rem;color:var(--muted)">Sem ${R(swL)}</span>
            <span style="font-family:var(--mono);font-size:.72rem;color:${gColor(spW)}">${floorPct(spW)}%</span>
          </div>
          <div class="mb"><div class="mf" style="width:${Math.min(spW,100)}%;background:${gColor(spW)}"></div></div>
          ${prizeW?`<span class="gbadge ${prizeW.label.toLowerCase()}" style="margin-top:3px">${prizeW.label} +R$${prizeW.prize}</span>`:''}
        </div>`;
      }
      if (sgm && !sgw) {
        const mPrize = prizeForPctMonthly(spM);
        h += `<div class="ks-sc-goal">
          <div class="ks-sc-goal-row">
            <span style="font-size:.6rem;color:var(--muted)">Mês ${R(sLiqM)}</span>
            <span style="font-family:var(--mono);font-size:.72rem;color:${gColor(spM)}">${floorPct(spM)}%</span>
          </div>
          <div class="mb"><div class="mf" style="width:${Math.min(spM,100)}%;background:${gColor(spM)}"></div></div>
          ${mPrize?`<span class="gbadge ${mPrize.label.toLowerCase()}" style="margin-top:3px">${mPrize.label}</span>`:''}
        </div>`;
      }
      h += `</div>`;
    });

    // Inactive sellers row (if they have sales)
    if (inactSales > 0) {
      const isSel = selSet.has('__inact__');
      h += `<div class="ks-seller-card${isSel?'':' ks-sc-dimmed'}" style="opacity:.5;cursor:pointer"
        onclick="kqToggleSeller(${ki},'__inact__',${JSON.stringify([...selSet])})">
        <div class="ks-sc-head">
          <span class="ks-sc-name" style="color:var(--muted)">Inativos</span>
        </div>
        <div class="ks-sc-liq" style="color:var(--muted)">${R(inactSales)}</div>
      </div>`;
    }

    h += `</div>`;  // ks-sellers

    // ── Daily chart (clickable sellers filter) ───────
    h += `<div class="ks-chart">
      <div class="ks-chart-lbl">Faturamento Líquido Diário${wctx?' · '+wctx.label:' · '+monthLabel(selMonth)}</div>
      <div class="ks-chart-canvas-wrap"><canvas id="cd${ki}"></canvas></div>
    </div>`;

    h += `</div>`;  // kiosk-section
  });

  document.getElementById('kiosquesBody').innerHTML = h;

  setTimeout(() => {
    ks.forEach((k, ki) => {
      try {
        const cv = document.getElementById('cd'+ki); if (!cv) return;
        destroyChart('cd'+ki);
        const kc     = KC[ki % KC.length];
        const kName  = k.name;
        const selKey = `${ki}`;
        const selSet = window._kqSel[selKey] || new Set();
        const dates  = Object.keys(k.byDate).filter(d=>d.slice(0,7)===selMonth).sort();
        const activeSel = activeSellers(kName);
        const hasCfg    = activeSel.length > 0;

        // Build data: sum of selected sellers
        const vals = dates.map(d => {
          let total = 0;
          // Active sellers
          Object.entries(k.sellers).forEach(([sn, s]) => {
            const isActive = !hasCfg || activeSel.includes(sn);
            if (isActive && selSet.has(sn)) {
              total += s.byDate?.[d]?.liq || 0;
            }
            if (!isActive && selSet.has('__inact__')) {
              total += s.byDate?.[d]?.liq || 0;
            }
          });
          return total;
        });

        chartInstances['cd'+ki] = new Chart(cv, {
          type:'line',
          data:{labels:dates.map(fmtDL),datasets:[{
            data:vals,borderColor:kc.line,
            backgroundColor:kc.fill,
            tension:.35,fill:true,pointRadius:2,borderWidth:1.5
          }]},
          options:{responsive:true,animation:false,maintainAspectRatio:false,
            plugins:{legend:{display:false}},scales:{
              x:{grid:{display:false},ticks:{color:'#666',font:{family:'DM Mono',size:9},maxTicksLimit:8}},
              y:{grid:{color:'#1a1a1a'},ticks:{color:'#666',font:{family:'DM Mono',size:9},callback:v=>'R$'+v.toLocaleString('pt-BR',{notation:'compact'})}}
            }
          }
        });
      } catch(e) { console.warn('kiosques chart:', e.message); }
    });
  }, 100);
  } catch(e) { console.error('renderKiosques ERROR:', e.message, e.stack?.split('\n')[1]); }
}

// Toggle seller selection in Quiosques tab
function kqToggleSeller(ki, sName, _unused) {
  if (!window._kqSel) window._kqSel = {};
  const selKey = `${ki}`;
  if (!window._kqSel[selKey]) window._kqSel[selKey] = new Set();
  const selSet = window._kqSel[selKey];
  if (selSet.has(sName)) {
    if (selSet.size > 1) selSet.delete(sName);  // keep at least one selected
  } else {
    selSet.add(sName);
  }
  renderKiosques();
}
