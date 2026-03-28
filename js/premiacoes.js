// ══════════════════════════════════════════════════════════
//  RENDER PREMIAÇÕES (admin-only)
// ══════════════════════════════════════════════════════════
function renderPremiacoes() {
  const ks = Object.values(store.kiosks).sort((a,b) =>
    kioskMonthLiq(b.name, geralPeriod||'') - kioskMonthLiq(a.name, geralPeriod||''));
  if (!ks.length) {
    document.getElementById('premiacoesBody').innerHTML =
      '<div class="empty"><div class="ei">○</div><div class="et">Nenhum dado</div></div>';
    return;
  }

  const months  = availableMonths();
  const selMonth = geralPeriod || (store.dateRange||[]).map(d=>d.slice(0,7)).sort().slice(-1)[0] || months[0];
  const allWeeks = buildWeeksForMonth(selMonth);
  const wctx    = getWeekCtx();

  let h = `<div class="geral-toolbar" style="margin-bottom:20px">
    <div class="geral-filters">
      <div class="geral-filter-item">
        <label class="geral-month-lbl">Mês</label>
        <select class="geral-month-sel" onchange="geralPeriod=this.value;renderPremiacoes()">`;
  months.forEach(m => h += `<option value="${m}"${m===selMonth?' selected':''}>${monthLabel(m)}</option>`);
  h += `</select></div></div></div>`;

  // Monthly prize table
  h += `<div class="h2">Prêmio Mensal</div>
  <div class="tw tw-scroll"><table><thead><tr>
    <th>Vendedor</th><th>Quiosque</th>
    <th class="num">Faturamento</th><th class="num">Meta</th>
    <th class="num">%</th><th>Faixa</th><th class="num">Prêmio</th>
  </tr></thead><tbody>`;

  const allSellers = Object.values(store.sellers).sort((a,b) =>
    sellerMonthLiq(b.kiosk||'', b.name, selMonth) - sellerMonthLiq(a.kiosk||'', a.name, selMonth));
  allSellers.forEach(s => {
    const kName = s.kiosk||'';
    const cfg   = goals.kiosks[kName]?.activeSellers?.length > 0;
    if (cfg && !activeSellers(kName).includes(s.name)) return;
    const sLiq = sellerMonthLiq(kName, s.name, selMonth);
    const sgm  = sellerMonthGoal(kName, selMonth);
    const spM  = sgm>0 ? sLiq/sgm*100 : 0;
    const mp   = sgm>0 ? prizeForPctMonthly(spM) : null;
    const cls  = mp ? mp.label.toLowerCase() : '';
    h += `<tr>
      <td><strong>${s.name}</strong></td>
      <td style="color:var(--muted);font-size:.8rem">${sK(kName)}</td>
      <td class="mo num">${R(sLiq)}</td>
      <td class="mo num">${sgm?R(sgm):'—'}</td>
      <td class="num" style="color:${sgm?gColor(spM):'var(--muted)'}"><strong>${sgm?floorPct(spM)+'%':'—'}</strong></td>
      <td>${mp?`<span class="gbadge ${cls}">${mp.label}</span>`:'<span style="color:var(--muted);font-size:.75rem">—</span>'}</td>
      <td class="mo num">${mp?`<strong>R$&nbsp;${mp.prize.toFixed(2).replace('.',',')}</strong>`:'—'}</td>
    </tr>`;
  });
  h += `</tbody></table></div>`;

  // Weekly prize tables
  if (allWeeks.length) {
    h += `<div class="h2">Prêmio Semanal</div>`;
    allWeeks.forEach((w, wi) => {
      h += `<div style="font-size:.75rem;color:var(--muted);margin:16px 0 6px;font-family:var(--mono)">S${wi+1} · ${w.label}${w.crossMonth?' ↗':''}</div>
      <div class="tw tw-scroll"><table><thead><tr>
        <th>Vendedor</th><th>Quiosque</th>
        <th class="num">Real</th><th class="num">Meta</th>
        <th class="num">%</th><th>Faixa</th><th class="num">Prêmio</th>
      </tr></thead><tbody>`;

      allSellers.forEach(s => {
        const kName = s.kiosk||'';
        const cfg   = goals.kiosks[kName]?.activeSellers?.length > 0;
        if (cfg && !activeSellers(kName).includes(s.name)) return;
        const sgw  = sellerWeekGoal(kName, w.monKey);
        const swL  = sWeekLiq(kName, s.name, w.monday, w.sunday);
        const spW  = sgw>0 ? swL/sgw*100 : 0;
        const prize= sgw>0 ? prizeForPct(spW) : null;
        const cls  = prize ? prize.label.toLowerCase() : '';
        h += `<tr>
          <td><strong>${s.name}</strong></td>
          <td style="color:var(--muted);font-size:.8rem">${sK(kName)}</td>
          <td class="mo num">${R(swL)}</td>
          <td class="mo num">${sgw?R(sgw):'—'}</td>
          <td class="num" style="color:${sgw?gColor(spW):'var(--muted)'}"><strong>${sgw?floorPct(spW)+'%':'—'}</strong></td>
          <td>${prize?`<span class="gbadge ${cls}">${prize.label}</span>`:'<span style="color:var(--muted);font-size:.75rem">—</span>'}</td>
          <td class="mo num">${prize?`<strong>R$&nbsp;${prize.prize.toFixed(2).replace('.',',')}</strong>`:'—'}</td>
        </tr>`;
      });
      h += `</tbody></table></div>`;
    });
  }

  // Prize tier reference
  h += `<div class="h2">Faixas de Premiação</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div class="card">
      <div class="ct">Mensal</div><div class="cs">por vendedor</div>
      ${PRIZE_TIERS_MONTHLY.map(t=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span class="gbadge ${t.label.toLowerCase()}">${t.label}</span><span style="font-size:.8rem;color:var(--muted)">≥${t.pct}%</span><span class="mo" style="font-size:.88rem">R$&nbsp;${t.prize}</span></div>`).join('')}
    </div>
    <div class="card">
      <div class="ct">Semanal</div><div class="cs">por vendedor</div>
      ${PRIZE_TIERS.map(t=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span class="gbadge ${t.label.toLowerCase()}">${t.label}</span><span style="font-size:.8rem;color:var(--muted)">≥${t.pct}%</span><span class="mo" style="font-size:.88rem">R$&nbsp;${t.prize}</span></div>`).join('')}
    </div>
  </div>`;

  document.getElementById('premiacoesBody').innerHTML = h;
}


// ── Daily goals CSV import ──────────────────────────
let _pendingDailyGoals = null;  // parsed before save

function loadDailyGoalCSV(evt) {
  const file = evt.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const result = parseDailyGoalCSV(text);
    if (!result.rows.length) {
      document.getElementById('dailyGoalPreview').style.display = 'none';
      alert('Nenhuma linha válida encontrada. Verifique o formato: DD/MM, Quiosque, Meta');
      return;
    }
    _pendingDailyGoals = result.rows;
    renderDailyGoalPreview(result);
    document.getElementById('btnSaveDailyGoals').disabled = false;
  };
  reader.readAsText(file, 'UTF-8');
}

function parseDailyGoalCSV(text) {
  const rows = [];
  const errors = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  // Skip header row if present
  const start = lines[0]?.toLowerCase().includes('data') ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,;\t]/).map(s => s.trim().replace(/"/g,''));
    if (parts.length < 3) { errors.push(`Linha ${i+1}: colunas insuficientes`); continue; }
    const [rawDate, kName, rawMeta] = parts;
    // Parse date DD/MM or DD/MM/YYYY or DD/MM/YY
    const dm = rawDate.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/);
    if (!dm) { errors.push(`Linha ${i+1}: data inválida '${rawDate}'`); continue; }
    const day = dm[1].padStart(2,'0'), mon = dm[2].padStart(2,'0');
    const yr  = dm[3] ? (dm[3].length===2 ? '20'+dm[3] : dm[3]) : new Date().getFullYear().toString();
    const dateKey = `${yr}-${mon}-${day}`;
    // Parse meta value — handle both BR format (3.200 or 3.200,00) and plain (3200)
    const metaClean = rawMeta
      .replace(/\s/g,'')
      .replace(/\.(\d{3})/g,'$1')   // remove BR thousands separator (3.200 → 3200)
      .replace(',','.');             // convert BR decimal comma to dot
    const meta = parseFloat(metaClean);
    if (isNaN(meta) || meta < 0) { errors.push(`Linha ${i+1}: meta inválida '${rawMeta}'`); continue; }
    // Match kiosk name (fuzzy) — try full name, short name, and partial match
    const kKeys = Object.keys(store.kiosks);
    const kMatch = kKeys.find(k =>
      k.toLowerCase().includes(kName.toLowerCase()) ||
      kName.toLowerCase().includes(sK(k).toLowerCase()) ||
      sK(k).toLowerCase().includes(kName.toLowerCase())
    );
    // If no match found, store under raw CSV name (will be fixed when store loads)
    rows.push({ dateKey, kName: kMatch || kName, meta, rawKName: kName });
  }
  return { rows, errors };
}

function renderDailyGoalPreview(result) {
  const el = document.getElementById('dailyGoalPreview');
  if (!el) return;
  // Group by kiosk+month for summary
  const byKiosk = {};
  result.rows.forEach(({dateKey, kName, meta}) => {
    const mk = dateKey.slice(0,7);
    const key = kName+'|'+mk;
    if (!byKiosk[key]) byKiosk[key] = {kName, mk, total:0, days:0};
    byKiosk[key].total += meta;
    byKiosk[key].days++;
  });
  let html = `<div class="gdi-table-wrap"><table class="gdi-table"><thead><tr>
    <th>Quiosque</th><th>Mês</th><th class="num">Dias</th><th class="num">Total Mensal</th><th class="num">Média/dia</th>
  </tr></thead><tbody>`;
  Object.values(byKiosk).sort((a,b)=>a.kName.localeCompare(b.kName)).forEach(r => {
    html += `<tr><td>${sK(r.kName)}</td><td>${monthLabel(r.mk)}</td>
      <td class="num">${r.days}</td>
      <td class="num mo">${R(r.total)}</td>
      <td class="num mo">${R(r.total/r.days)}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  if (result.errors.length) {
    html += `<div style="font-size:.72rem;color:var(--danger);margin-top:8px">${result.errors.slice(0,5).join('<br>')}</div>`;
  }
  html += `<div style="font-size:.72rem;color:var(--muted);margin-top:6px">${result.rows.length} dias importados${result.errors.length?' · '+result.errors.length+' erros':''}</div>`;
  el.innerHTML = html;
  el.style.display = 'block';
}

async function saveDailyGoals() {
  if (!_pendingDailyGoals?.length) return;
  const btn = document.getElementById('btnSaveDailyGoals');
  if (btn) btn.disabled = true;
  showStatus('Salvando metas diárias…', 'dim');

  // Merge into goals — re-resolve kiosk names at save time (store is now loaded)
  _pendingDailyGoals.forEach(({dateKey, kName, rawKName, meta}) => {
    // Re-run fuzzy match now that store is definitely loaded
    const resolvedName = Object.keys(store.kiosks).find(k =>
      k.toLowerCase().includes((rawKName||kName).toLowerCase()) ||
      (rawKName||kName).toLowerCase().includes(sK(k).toLowerCase()) ||
      sK(k).toLowerCase().includes((rawKName||kName).toLowerCase())
    ) || kName;
    ensureKiosk(resolvedName);
    if (!goals.kiosks[resolvedName].dailyByDate) goals.kiosks[resolvedName].dailyByDate = {};
    goals.kiosks[resolvedName].dailyByDate[dateKey] = meta;
  });

  // Derive monthlyByMonth and weeklyOverride from dailyByDate for each kiosk
  for (const kn of Object.keys(goals.kiosks)) {
    const G = goals.kiosks[kn];
    if (!G.dailyByDate || !Object.keys(G.dailyByDate).length) continue;

    // Monthly: sum per YYYY-MM
    const monthly = {};
    Object.entries(G.dailyByDate).forEach(([d,v]) => {
      const mk = d.slice(0,7);
      monthly[mk] = (monthly[mk]||0) + v;
    });
    // Merge — only overwrite months that exist in the CSV (don't clear manual months)
    Object.entries(monthly).forEach(([mk,v]) => { G.monthlyByMonth[mk] = v; });

    // Weekly: sum per Mon key
    const weekly = {};
    Object.entries(G.dailyByDate).forEach(([d,v]) => {
      const dt  = new Date(d+'T00:00:00');
      const dow = dt.getDay();
      const daysBack = dow===0 ? 6 : dow-1;
      const mon = new Date(dt); mon.setDate(mon.getDate()-daysBack);
      const monKey = mon.toISOString().slice(0,10);
      weekly[monKey] = (weekly[monKey]||0) + v;
    });
    // Merge — only overwrite weeks present in CSV
    Object.entries(weekly).forEach(([wk,v]) => { G.weeklyOverride[wk] = v; });
  }

  try {
    await saveAllGoals();
    toast('Metas diárias salvas ✓', 'ok');
    _pendingDailyGoals = null;
    renderGoals();
  } catch(e) {
    showStatus('Erro: '+e.message, 'err');
    if (btn) btn.disabled = false;
  }
}

function clearMonthGoals() {
  if (!confirm(`Limpar todas as metas de ${monthLabel(goalsSelMonth)}?`)) return;
  const mk = goalsSelMonth;
  const [yr, mo] = mk.split('-').map(Number);
  const wKeys = weeksInMonth(yr, mo).map(w => w.monKey);
  Object.values(goals.kiosks).forEach(G => {
    if (G.weeklyOverride)   wKeys.forEach(k => delete G.weeklyOverride[k]);
    if (G.monthlyByMonth)   delete G.monthlyByMonth[mk];
  });
  Object.values(goals.sellers).forEach(S => {
    if (S.overrideMonthly) delete S.overrideMonthly[mk];
    if (S.overrideWeekly)  wKeys.forEach(k => delete S.overrideWeekly[k]);
  });
  saveAllGoals().then(() => renderGoals());
}
