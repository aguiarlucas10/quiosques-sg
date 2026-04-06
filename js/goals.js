// ══════════════════════════════════════════════════════════
//  GOALS MODULE — Configuration and rendering
// ══════════════════════════════════════════════════════════

let goalsSelMonth = null;

function initGoalsMonth() {
  if (goalsSelMonth) return;
  const months = availableMonths();
  const dm = (store.dateRange || []).map(d => d.slice(0, 7)).sort();
  goalsSelMonth = dm[dm.length - 1] || months[months.length - 1] || months[0];
}

function selectGoalsMonth(ym) { goalsSelMonth = ym; renderGoals(); }

// ── Global registry (safe integer indices for HTML attrs) ──
let _reg = { kiosks:[], sellers:[] };
function _ki(kn){ let i=_reg.kiosks.indexOf(kn); if(i<0){i=_reg.kiosks.length;_reg.kiosks.push(kn);} return i; }
function _si(sn){ let i=_reg.sellers.indexOf(sn); if(i<0){i=_reg.sellers.length;_reg.sellers.push(sn);} return i; }
function _kn(i){ return _reg.kiosks[i]; }
function _sn(i){ return _reg.sellers[i]; }
function _setKioskField(ki,field,mk,val){ setKioskField(_kn(ki),field,mk,val); }
function _setKioskExtra(ki,field,val){ const kn=_kn(ki); ensureKiosk(kn); if(field==='paGoal'||field==='ticketMedioGoal') goals.kiosks[kn][field]=parseFloat(val)||0; else goals.kiosks[kn][field]=val; }
function _setKioskWeek(ki,monKey,val){ setKioskWeek(_kn(ki),monKey,val); }
function _toggleSeller(ki,si){ toggleSeller(_kn(ki),_sn(si)); }
function _setSellerOverride(si,field,key,val){ setSellerOverride(_sn(si),field,key,val); }
function _tgw(ki){ toggleGeralWeeks(_kn(ki)); }

// ── Goals config rendering ─────────────────────────────────
function renderGoals() {
  const ks = Object.values(store.kiosks).sort((a,b) => b.liq - a.liq);
  initGoalsMonth();
  const months   = availableMonths();
  const monthKey = goalsSelMonth;
  const [yr, mo] = monthKey.split('-').map(Number);
  const weeks    = weeksInMonth(yr, mo);

  // Month selector
  let h = `<div class="goals-month-bar">`;
  months.forEach(m => h += `<button class="goals-month-btn${m===monthKey?' on':''}" onclick="selectGoalsMonth('${m}')">${monthLabel(m)}</button>`);
  h += `</div>`;

  if (!ks.length) {
    h += `<div class="empty"><div class="ei">○</div><div class="et">Importe um relatório primeiro</div></div>`;
    // ── Daily goals CSV import ──────────────────────────
  h += `<div class="h2">Metas Diárias</div>
  <div class="goals-daily-import">
    <div class="gdi-desc">
      Importe um CSV com as metas diárias de cada quiosque.<br>
      Colunas: <code>DATA</code> (DD/MM), <code>QUIOSQUE</code>, <code>META</code><br>
      A meta mensal e semanal serão calculadas automaticamente a partir das metas diárias.
    </div>
    <div class="gdi-preview" id="dailyGoalPreview" style="display:none"></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
      <label class="btn-secondary" style="cursor:pointer;padding:0 16px;line-height:36px;border-radius:6px;font-size:.82rem">
        Selecionar CSV
        <input type="file" accept=".csv,.txt" style="display:none" onchange="loadDailyGoalCSV(event)">
      </label>
      <button class="btn-primary" id="btnSaveDailyGoals" onclick="saveDailyGoals()" disabled style="height:36px;padding:0 16px;font-size:.82rem">
        Salvar metas diárias
      </button>
    </div>
  </div>`;

  document.getElementById('goalsBody').innerHTML = h;
    return;
  }

  h += `<div class="goals-grid">`;

  // ── LEFT: Kiosk config ──────────────────────────────────
  h += `<div class="goals-card">
    <div class="goals-card-title">Quiosques</div>
    <div class="goals-card-sub">${monthLabel(monthKey)} · meta total do quiosque</div>
    <div class="goals-card-hint">Configure a <strong>meta total</strong> do quiosque. A meta individual é calculada automaticamente: <strong>total ÷ n° ativos</strong>.</div>`;

  ks.forEach(k => {
    const kn  = k.name;
    const ki  = _ki(kn);
    const G   = goals.kiosks[kn] || {};
    const active  = G.activeSellers || [];
    const allS    = Object.values(k.sellers).sort((a,b) => (b.liq||0)-(a.liq||0));
    const nActive = active.length || allS.length;

    const mTotal = G.monthlyByMonth?.[monthKey] || '';
    const mInd   = (mTotal && nActive) ? parseFloat(mTotal)/nActive : 0;

    h += `<div class="gk-block">
      <div class="gk-head">
        <div>
          <div class="gk-name">${sK(kn)}</div>
          <div class="gk-sub" id="sub-k${ki}">${nActive} ativos${mInd?' · '+R(mInd)+'/vend.':''}</div>
        </div>
      </div>

      <div class="gk-std">
        <div class="gk-std-item">
          <span class="gk-lbl">Meta Mensal do Quiosque</span>
          <div class="gk-inp-row">
            <input class="gk-inp" type="number" min="0" step="1000"
              value="${mTotal}" placeholder="0"
              oninput="_setKioskField(${ki},'monthlyByMonth','${monthKey}',this.value)">
          </div>
          <div class="gk-hint" id="calc-k${ki}">${mInd?'→ '+R(mInd)+' por vendedor':''}</div>
        </div>
        <div class="gk-std-item">
          <span class="gk-lbl">Meta Ticket Médio (R$)</span>
          <div class="gk-inp-row">
            <input class="gk-inp" type="number" min="0" step="10"
              value="${G.ticketMedioGoal||''}" placeholder="0"
              oninput="_setKioskExtra(${ki},'ticketMedioGoal',this.value)">
          </div>
        </div>
      </div>
      <div class="gk-std">
        <div class="gk-std-item">
          <span class="gk-lbl">Meta P.A. (produtos/atend.)</span>
          <div class="gk-inp-row">
            <input class="gk-inp" type="number" min="0" step="0.1"
              value="${G.paGoal||''}" placeholder="0"
              oninput="_setKioskExtra(${ki},'paGoal',this.value)">
          </div>
        </div>
        <div class="gk-std-item">
          <span class="gk-lbl">Gerente da Loja</span>
          <div class="gk-inp-row">
            <select class="gk-inp" style="text-align:left" onchange="_setKioskExtra(${ki},'gerente',this.value)">
              <option value="">— nenhum —</option>
              ${allS.map(s => `<option value="${s.name}"${G.gerente===s.name?' selected':''}>${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="gk-sellers-lbl">Vendedores — ativo / inativo</div>
      <div class="seller-toggle-list" id="toggles-k${ki}">`;

    allS.forEach(s => {
      const si     = _si(s.name);
      const isAct  = active.length===0 || active.includes(s.name);
      h += `<div class="seller-toggle${isAct?' active':''}" id="tog-k${ki}-s${si}" onclick="_toggleSeller(${ki},${si})">
        <div>
          <div class="seller-toggle-name">${s.name}</div>
          <div class="seller-toggle-liq">${R(s.liq||0)}</div>
        </div>
        <div class="seller-toggle-switch"></div>
      </div>`;
    });

    h += `</div>
      <div class="gk-weeks">
        <div class="gk-week-lbl">Metas Semanais do Quiosque</div>`;

    weeks.forEach((w, wi) => {
      const wTotal = G.weeklyOverride?.[w.monKey] || '';
      const wInd   = (wTotal && nActive) ? parseFloat(wTotal)/nActive : 0;
      h += `<div class="gk-week-row">
        <span class="gk-week-label">S${wi+1} <span style="color:var(--muted)">${w.label}${w.crossMonth?' ↗':''}</span></span>
        <div class="gk-week-right">
          <span class="gk-week-calc" id="wcalc-k${ki}-${w.monKey}">${wInd?'→ '+R(wInd)+'/vend.':''}</span>
          <input class="gk-inp" type="number" min="0" step="500" style="width:110px"
            value="${wTotal}" placeholder="0"
            oninput="_setKioskWeek(${ki},'${w.monKey}',this.value)">
        </div>
      </div>`;
    });

    h += `</div></div>`;  // gk-weeks + gk-block
  });
  h += `</div>`;  // left goals-card

  // ── RIGHT: Seller overrides (optional, falls back to kiosk÷n) ──
  h += `<div class="goals-card">
    <div class="goals-card-title">Ajustes Individuais</div>
    <div class="goals-card-sub">${monthLabel(monthKey)} · sobrescreve o padrão</div>
    <div class="goals-card-hint">Opcional. Se vazio, usa a meta do quiosque ÷ n° ativos.</div>`;

  ks.forEach(k => {
    const active  = goals.kiosks[k.name]?.activeSellers || [];
    const allS    = Object.values(k.sellers).sort((a,b) => (b.liq||0)-(a.liq||0));
    const visible = active.length > 0 ? allS.filter(s => active.includes(s.name)) : allS;
    if (!visible.length) return;

    h += `<div class="goal-kiosk-section">
      <div class="gk-kiosk-lbl">${sK(k.name)}</div>`;

    visible.forEach(s => {
      const si  = _si(s.name);
      const ov  = goals.sellers[s.name] || {};
      const ovM = ov.overrideMonthly?.[monthKey] || '';

      h += `<div class="gk-override-row">
        <span class="gk-override-name">${s.name}</span>
        <div style="display:flex;flex-direction:column;gap:2px">
          <span class="gk-lbl">Mensal</span>
          <input class="gk-inp" type="number" min="0" step="500" style="width:100px"
            value="${ovM}" placeholder="padrão"
            oninput="_setSellerOverride(${si},'overrideMonthly','${monthKey}',this.value)">
        </div>
      </div>
      <div style="margin-bottom:10px">`;

      weeks.forEach((w, wi) => {
        const ovW = ov.overrideWeekly?.[w.monKey] || '';
        h += `<div class="gk-week-row" style="padding:3px 0">
          <span class="gk-week-label" style="font-size:.75rem">S${wi+1} <span style="color:var(--muted)">${w.label}</span></span>
          <input class="gk-inp" type="number" min="0" step="200" style="width:100px"
            value="${ovW}" placeholder="padrão"
            oninput="_setSellerOverride(${si},'overrideWeekly','${w.monKey}',this.value)">
        </div>`;
      });
      h += `</div>`;
    });
    h += `</div>`;
  });
  h += `</div></div>`;  // right card + grid

  h += `<div class="goals-actions">
    <button class="btn-primary" onclick="saveAllGoals()">Salvar metas</button>
    <button class="btn-secondary" onclick="clearMonthGoals()">Limpar mês</button>
    <span class="save-notice" id="saveNotice">✓ Salvo</span>
  </div>`;

  // ── Daily goals CSV import ──────────────────────────
  h += `<div class="h2">Metas Diárias</div>
  <div class="goals-daily-import">
    <div class="gdi-desc">
      Importe um CSV com as metas diárias de cada quiosque.<br>
      Colunas: <code>DATA</code> (DD/MM), <code>QUIOSQUE</code>, <code>META</code><br>
      A meta mensal e semanal serão calculadas automaticamente a partir das metas diárias.
    </div>
    <div class="gdi-preview" id="dailyGoalPreview" style="display:none"></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
      <label class="btn-secondary" style="cursor:pointer;padding:0 16px;line-height:36px;border-radius:6px;font-size:.82rem">
        Selecionar CSV
        <input type="file" accept=".csv,.txt" style="display:none" onchange="loadDailyGoalCSV(event)">
      </label>
      <button class="btn-primary" id="btnSaveDailyGoals" onclick="saveDailyGoals()" disabled style="height:36px;padding:0 16px;font-size:.82rem">
        Salvar metas diárias
      </button>
    </div>
  </div>`;

  // ── Daily goals table ──────────────────────────────
  const allKioskNames = Object.values(store.kiosks).sort((a,b)=>b.liq-a.liq).map(k=>k.name);
  const allDailyDates = new Set();
  allKioskNames.forEach(kn => {
    Object.keys(goals.kiosks[kn]?.dailyByDate||{}).forEach(d => allDailyDates.add(d));
  });
  const sortedDailyDates = [...allDailyDates].sort();

  if (sortedDailyDates.length) {
    h += `<div class="h2" style="margin-top:24px">Metas Diárias Configuradas</div>
    <div class="tw tw-scroll"><table>
      <thead><tr>
        <th>Data</th>`;
    allKioskNames.forEach(kn => h += `<th class="num">${sK(kn)}</th>`);
    h += `<th class="num">Total</th></tr></thead><tbody>`;

    sortedDailyDates.forEach(d => {
      const [y,m,dd] = d.split('-');
      const rowDate = `${dd}/${m}`;
      const vals = allKioskNames.map(kn => goals.kiosks[kn]?.dailyByDate?.[d] || 0);
      const total = vals.reduce((s,v) => s+v, 0);
      h += `<tr>
        <td style="font-family:var(--mono);font-size:.82rem">${rowDate}</td>`;
      vals.forEach(v => h += `<td class="mo num" style="font-size:.82rem">${v ? R(v) : '<span style="color:var(--muted)">—</span>'}</td>`);
      h += `<td class="mo num" style="font-size:.82rem">${total ? R(total) : '—'}</td>
      </tr>`;
    });

    // Totals row
    h += `<tr style="border-top:1px solid var(--border)">
      <td style="font-size:.72rem;color:var(--muted)">Total</td>`;
    allKioskNames.forEach(kn => {
      const t = Object.values(goals.kiosks[kn]?.dailyByDate||{}).reduce((s,v)=>s+v,0);
      h += `<td class="mo num" style="font-size:.82rem">${t ? R(t) : '—'}</td>`;
    });
    const grandTotal = allKioskNames.reduce((s,kn)=>s+Object.values(goals.kiosks[kn]?.dailyByDate||{}).reduce((ss,v)=>ss+v,0),0);
    h += `<td class="mo num" style="font-size:.82rem">${grandTotal ? R(grandTotal) : '—'}</td></tr>`;
    h += `</tbody></table></div>`;
  } else {
    h += `<div class="h2" style="margin-top:24px">Metas Diárias Configuradas</div>
    <div style="color:var(--muted);font-size:.82rem;padding:16px 0">Nenhuma meta diária importada ainda.</div>`;
  }

  document.getElementById('goalsBody').innerHTML = h;
}

// ── Goals setters ─────────────────────────────────────────
function ensureKiosk(kn) {
  if (!goals.kiosks[kn]) goals.kiosks[kn] = { monthlyByMonth:{}, weeklyOverride:{}, activeSellers:[], dailyByDate:{}, ticketMedioGoal:0, paGoal:0, gerente:'' };
  const G = goals.kiosks[kn];
  if (!G.monthlyByMonth)  G.monthlyByMonth = {};
  if (!G.dailyByDate)     G.dailyByDate = {};
  if (!G.weeklyOverride)  G.weeklyOverride = {};
  if (!G.activeSellers)   G.activeSellers = [];
  if (G.ticketMedioGoal === undefined) G.ticketMedioGoal = 0;
  if (G.paGoal === undefined)          G.paGoal = 0;
  if (G.gerente === undefined)         G.gerente = '';
}
function ensureSeller(sn) {
  if (!goals.sellers[sn]) goals.sellers[sn] = { overrideMonthly:{}, overrideWeekly:{} };
  if (!goals.sellers[sn].overrideMonthly) goals.sellers[sn].overrideMonthly = {};
  if (!goals.sellers[sn].overrideWeekly)  goals.sellers[sn].overrideWeekly  = {};
}

function setKioskField(kn, field, mk, val) {
  ensureKiosk(kn);
  if (field === 'monthlyByMonth') {
    goals.kiosks[kn].monthlyByMonth[mk] = parseFloat(val) || 0;
  } else {
    goals.kiosks[kn][field] = parseFloat(val) || 0;
  }
  _refreshKioskLabels(kn, mk);
  // Live update daily hint
  if (field === 'dailyGoal') {
    const ki = _ki(kn);
    const hint = document.querySelector(`#goals-k${ki}-daily-hint`);
    if (hint) { const v = parseFloat(val)||0; hint.textContent = v ? '→ super '+R(v*1.2) : ''; }
  }
}

function setKioskWeek(kn, monKey, val) {
  ensureKiosk(kn);
  const v = parseFloat(val) || 0;
  if (v) goals.kiosks[kn].weeklyOverride[monKey] = v;
  else   delete goals.kiosks[kn].weeklyOverride[monKey];
  _refreshKioskWeekLabel(kn, monKey);
}

function _refreshKioskLabels(kn, monthKey) {
  const ki = _ki(kn);
  const G  = goals.kiosks[kn];
  const nActive = G.activeSellers.length || Object.keys(store.kiosks[kn]?.sellers||{}).length;
  const mTot = monthKey ? (G.monthlyByMonth?.[monthKey]||0) : 0;
  const mInd = nActive && mTot ? mTot/nActive : 0;
  const sub  = document.getElementById(`sub-k${ki}`);
  if (sub)  sub.textContent = `${nActive} ativos${mInd?' · '+R(mInd)+'/vend.':''}`;
  const calc = document.getElementById(`calc-k${ki}`);
  if (calc) calc.textContent = mInd ? '→ '+R(mInd)+' por vendedor' : '';
  // Refresh all week labels too (n changed)
  if (goalsSelMonth) {
    const [yr,mo] = goalsSelMonth.split('-').map(Number);
    weeksInMonth(yr,mo).forEach(w => _refreshKioskWeekLabel(kn, w.monKey));
  }
}

function _refreshKioskWeekLabel(kn, monKey) {
  const ki = _ki(kn);
  const G  = goals.kiosks[kn];
  const nActive = G.activeSellers.length || Object.keys(store.kiosks[kn]?.sellers||{}).length;
  const wTotal  = G.weeklyOverride?.[monKey] || 0;
  const wInd    = nActive && wTotal ? wTotal/nActive : 0;
  const el = document.getElementById(`wcalc-k${ki}-${monKey}`);
  if (el) el.textContent = wInd ? '→ '+R(wInd)+'/vend.' : '';
}

function toggleSeller(kn, sName) {
  ensureKiosk(kn);
  const allSellers = Object.keys(store.kiosks[kn]?.sellers || {});
  let active = goals.kiosks[kn].activeSellers;
  // If none explicitly configured, treat as "all active" and init list now
  if (active.length === 0) {
    goals.kiosks[kn].activeSellers = active = [...allSellers];
  }
  // Toggle: if currently active, deactivate; if inactive, reactivate
  const idx = active.indexOf(sName);
  if (idx >= 0) active.splice(idx, 1); else active.push(sName);
  // Update toggle UI
  const ki = _ki(kn), si = _si(sName);
  const tog = document.getElementById(`tog-k${ki}-s${si}`);
  if (tog) tog.classList.toggle('active', active.includes(sName));
  _refreshKioskLabels(kn, goalsSelMonth);
}

function setSellerOverride(sn, field, key, val) {
  ensureSeller(sn);
  goals.sellers[sn][field][key] = parseFloat(val) || 0;
}

async function saveAllGoals() {
  showStatus('Salvando…', 'dim');
  try {
    await window.fbSaveGoals(JSON.parse(JSON.stringify(goals)));
    renderGeral(); renderKiosques();
    if (document.getElementById('pnl-goals')?.classList.contains('on')) renderGoals();
    const n = document.getElementById('saveNotice');
    if (n) { n.classList.add('show'); setTimeout(() => n.classList.remove('show'), 2500); }
    hideStatus();
  } catch(e) { showStatus('Erro: '+e.message, 'err'); }
}
